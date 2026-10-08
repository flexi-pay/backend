import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { RateLimiter } from "../src/ratelimit.js";
import { buildMessage, signMessage } from "../src/signature.js";
import { FileStore } from "../src/store.js";

let base = "";
let dataFile = "";
const server = { close: () => {} };
const alice = Keypair.random();
const bob = Keypair.random();

const signed = (intent: "register" | "delete", name: string, kp: Keypair, extra: Record<string, unknown> = {}) => {
  const timestamp = Math.floor(Date.now() / 1000);
  return { name, address: kp.publicKey(), timestamp, signature: signMessage(kp.secret(), buildMessage(intent, name, kp.publicKey(), timestamp)), ...extra };
};
const call = (path: string, init?: RequestInit) => fetch(base + path, { headers: { "content-type": "application/json", origin: "https://app.flexipay.app" }, ...init });
const post = (body: unknown) => call("/api/names", { method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
  dataFile = join(await mkdtemp(join(tmpdir(), "flexipay-")), "names.json");
  const cfg = loadConfig({ HOME_DOMAIN: "flexipay.app", PUBLIC_URL: "https://api.flexipay.app", DATA_FILE: dataFile, CORS_ORIGINS: "https://app.flexipay.app" });
  const app = buildApp(cfg, await FileStore.open(dataFile), new RateLimiter(1000, 60_000));
  await new Promise<void>((r) => app.listen(0, r));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  server.close = () => app.close();
});
afterAll(() => server.close());

describe("FlexiPay names service", () => {
  it("serves health and stellar.toml", async () => {
    expect(await (await call("/health")).json()).toMatchObject({ ok: true, domain: "flexipay.app" });
    const toml = await (await call("/.well-known/stellar.toml")).text();
    expect(toml).toContain('FEDERATION_SERVER="https://api.flexipay.app/federation"');
    expect(toml).toContain("Test SDF Network");
  });

  it("registers a name with a valid signature and resolves it via federation", async () => {
    expect((await (await call("/api/names/alice")).json()).available).toBe(true);
    const r = await post(signed("register", "alice", alice));
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ stellarAddress: "alice*flexipay.app", address: alice.publicKey() });

    const fed = await (await call("/federation?type=name&q=Alice*flexipay.app")).json();
    expect(fed).toEqual({ stellar_address: "alice*flexipay.app", account_id: alice.publicKey() });
    const rev = await (await call(`/federation?type=id&q=${alice.publicKey()}`)).json();
    expect(rev.stellar_address).toBe("alice*flexipay.app");
    expect((await (await call("/api/names/alice")).json()).available).toBe(false);
  });

  it("persists to disk", async () => {
    const data = JSON.parse(await readFile(dataFile, "utf8"));
    expect(data.names.map((n: { name: string }) => n.name)).toContain("alice");
  });

  it("refuses taken names, bad signatures and reserved names", async () => {
    expect((await post(signed("register", "alice", bob))).status).toBe(409);
    const forged = { ...signed("register", "bobby", bob), address: alice.publicKey() };
    expect((await post(forged)).status).toBe(401);
    expect((await post(signed("register", "admin", bob))).status).toBe(400);
    expect((await post({ ...signed("register", "bobby", bob), timestamp: 1 })).status).toBe(401);
  });

  it("supports memos for custodial accounts", async () => {
    const r = await post(signed("register", "bob.exchange", bob, { memo: "123456", memoType: "id" }));
    expect(r.status).toBe(201);
    const fed = await (await call("/federation?type=name&q=bob.exchange*flexipay.app")).json();
    expect(fed).toMatchObject({ memo_type: "id", memo: "123456" });
    expect((await post(signed("register", "carol", Keypair.random(), { memo: "x".repeat(29) }))).status).toBe(400);
  });

  it("moves an account to a new name, releasing the old one", async () => {
    expect((await post(signed("register", "bobby", bob))).status).toBe(201);
    expect((await call("/federation?type=name&q=bob.exchange*flexipay.app")).status).toBe(404);
    expect((await (await call(`/api/accounts/${bob.publicKey()}`)).json()).name).toBe("bobby");
  });

  it("deletes only with the owner's signature", async () => {
    const del = (body: unknown) => call("/api/names/alice", { method: "DELETE", body: JSON.stringify(body) });
    expect((await del(signed("delete", "alice", bob))).status).toBe(401);
    expect((await del(signed("register", "alice", alice))).status).toBe(401); // wrong intent
    expect((await del(signed("delete", "alice", alice))).status).toBe(204);
    expect((await call("/federation?type=name&q=alice*flexipay.app")).status).toBe(404);
  });

  it("handles federation errors, CORS and unknown routes", async () => {
    expect((await call("/federation?type=name&q=alice*other.com")).status).toBe(404);
    expect((await call("/federation?type=name&q=nostar")).status).toBe(400);
    expect((await call("/federation?type=txid&q=x")).status).toBe(501);
    const pre = await call("/api/names", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://app.flexipay.app");
    expect((await call("/nope")).status).toBe(404);
    expect((await call("/health", { method: "POST" })).status).toBe(405);
    expect((await call("/api/names", { method: "POST", body: "{bad json" })).status).toBe(400);
  });
});
