// Register / look up / release FlexiPay names. Writes require a SEP-53 signature
// from the Stellar account the name points to.
import type { Config } from "../config.js";
import { error, HttpError, json, type Router } from "../http.js";
import { normalizeName, validateName } from "../names.js";
import type { RateLimiter } from "../ratelimit.js";
import { buildMessage, checkSignedRequest } from "../signature.js";
import type { NameStore } from "../store.js";

interface Body {
  name?: unknown;
  address?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  memo?: unknown;
  memoType?: unknown;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function validMemo(memo: string, type: string): string | null {
  if (!memo) return null;
  if (type === "id") return /^\d{1,20}$/.test(memo) && BigInt(memo) < 2n ** 64n ? null : "ID memos must be a 64-bit number";
  if (type === "hash") return /^[0-9a-f]{64}$/i.test(memo) ? null : "Hash memos must be 64 hex characters";
  return Buffer.byteLength(memo, "utf8") <= 28 ? null : "Text memos are at most 28 bytes";
}

export function nameRoutes(router: Router, cfg: Config, store: NameStore, limiter: RateLimiter) {
  const limit = (ip: string) => {
    if (!limiter.allow(ip)) throw new HttpError(429, "Too many requests — slow down");
  };

  /** Availability + current owner. */
  router.get("/api/names/:name", (req) => {
    const name = normalizeName(req.params.name);
    const invalid = validateName(name);
    const rec = store.get(name);
    return json({
      name,
      stellarAddress: `${name}*${cfg.homeDomain}`,
      available: !invalid && !rec,
      reason: invalid ?? (rec ? "Already taken" : undefined),
      address: rec?.address,
    });
  });

  /** Reverse lookup: which name does this account have? */
  router.get("/api/accounts/:address", (req) => {
    const rec = store.byAddress(req.params.address);
    return rec ? json({ name: rec.name, stellarAddress: `${rec.name}*${cfg.homeDomain}`, memo: rec.memo ?? null }) : error(404, "No name for this account");
  });

  /** The exact message the client must sign (helps wallet UIs). */
  router.get("/api/message", (req) => {
    const intent = req.query.get("intent") === "delete" ? "delete" : "register";
    const name = normalizeName(req.query.get("name") ?? "");
    const address = req.query.get("address") ?? "";
    const timestamp = Math.floor(Date.now() / 1000);
    return json({ intent, timestamp, message: buildMessage(intent, name, address, timestamp) });
  });

  /** Claim (or move to) a name. One name per account; claiming a new one releases the old. */
  router.post("/api/names", async (req) => {
    limit(req.ip);
    const b = (await req.body()) as Body;
    const name = normalizeName(str(b.name));
    const address = str(b.address);
    const memo = str(b.memo).trim();
    const memoType = (["text", "id", "hash"].includes(str(b.memoType)) ? str(b.memoType) : "text") as "text" | "id" | "hash";
    const invalid = validateName(name);
    if (invalid) return error(400, invalid);
    const memoErr = validMemo(memo, memoType);
    if (memoErr) return error(400, memoErr);
    const sigErr = checkSignedRequest("register", { name, address, timestamp: Number(b.timestamp), signature: str(b.signature) }, cfg.maxSkewSeconds);
    if (sigErr) return error(401, sigErr);
    const existing = store.get(name);
    if (existing && existing.address !== address) return error(409, "That name is already taken");
    const now = new Date().toISOString();
    await store.put({ name, address, ...(memo ? { memo, memoType } : {}), createdAt: existing?.createdAt ?? now, updatedAt: now });
    return json({ name, stellarAddress: `${name}*${cfg.homeDomain}`, address }, existing ? 200 : 201);
  });

  /** Release a name. */
  router.delete("/api/names/:name", async (req) => {
    limit(req.ip);
    const name = normalizeName(req.params.name);
    const b = (await req.body()) as Body;
    const rec = store.get(name);
    if (!rec) return error(404, "Name not found");
    const sigErr = checkSignedRequest("delete", { name, address: rec.address, timestamp: Number(b.timestamp), signature: str(b.signature) }, cfg.maxSkewSeconds);
    if (sigErr) return error(401, sigErr);
    await store.delete(name);
    return { status: 204 };
  });
}
