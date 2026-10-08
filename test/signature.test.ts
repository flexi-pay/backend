import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildMessage, checkSignedRequest, sep53Hash, signMessage, verifyMessage } from "../src/signature.js";

const kp = Keypair.random();
const other = Keypair.random();

describe("SEP-53 signatures", () => {
  it("uses the SEP-53 prefix", () => {
    // sha256("Stellar Signed Message:\nHello, World!") from the SEP-53 spec
    expect(sep53Hash("Hello, World!").toString("hex")).toBe("d52eb59c06bb510d065997ff93077068eed0a486c20215b5e02e1ab0d2ebea5f");
    expect(sep53Hash("x")).toHaveLength(32);
  });
  it("verifies SEP-53 and raw signatures, base64 or hex", () => {
    const msg = buildMessage("register", "nuel", kp.publicKey(), 1);
    const sep53 = signMessage(kp.secret(), msg);
    expect(verifyMessage(kp.publicKey(), msg, sep53)).toBe(true);
    expect(verifyMessage(kp.publicKey(), msg, Buffer.from(sep53, "base64").toString("hex"))).toBe(true);
    const raw = Buffer.from(kp.sign(Buffer.from(msg))).toString("base64");
    expect(verifyMessage(kp.publicKey(), msg, raw)).toBe(true);
  });
  it("rejects wrong key, tampered message and garbage", () => {
    const msg = buildMessage("register", "nuel", kp.publicKey(), 1);
    const sig = signMessage(kp.secret(), msg);
    expect(verifyMessage(other.publicKey(), msg, sig)).toBe(false);
    expect(verifyMessage(kp.publicKey(), msg + "x", sig)).toBe(false);
    expect(verifyMessage(kp.publicKey(), msg, "not-a-signature")).toBe(false);
    expect(verifyMessage("GBAD", msg, sig)).toBe(false);
  });
  it("checks freshness and intent", () => {
    const now = 1_000_000;
    const sign = (intent: "register" | "delete", ts: number) => signMessage(kp.secret(), buildMessage(intent, "nuel", kp.publicKey(), ts));
    const ok = { name: "nuel", address: kp.publicKey(), timestamp: now, signature: sign("register", now) };
    expect(checkSignedRequest("register", ok, 300, now)).toBeNull();
    expect(checkSignedRequest("register", ok, 300, now + 301)).toMatch(/expired/);
    expect(checkSignedRequest("delete", ok, 300, now)).toMatch(/does not match/); // signed for register, replayed as delete
    expect(checkSignedRequest("register", { ...ok, address: "nope" }, 300, now)).toMatch(/Invalid/);
  });
});
