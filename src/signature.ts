// Proof that a request comes from the owner of a Stellar account.
// Clients sign a short text message with their account key using SEP-53
// ("Stellar Signed Message"), which wallets like Freighter, xBull and Starling support.
import { createHash } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const SEP53_PREFIX = "Stellar Signed Message:\n";

export type Intent = "register" | "delete";

/** The exact text a client must sign. */
export function buildMessage(intent: Intent, name: string, address: string, timestamp: number): string {
  return `flexipay:${intent}:${name}:${address}:${timestamp}`;
}

export function sep53Hash(message: string): Buffer {
  return createHash("sha256").update(Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), Buffer.from(message, "utf8")])).digest();
}

/** Signs like a SEP-53 wallet would (used by tests and the built-in wallet). */
export function signMessage(secret: string, message: string): string {
  return Buffer.from(Keypair.fromSecret(secret).sign(sep53Hash(message))).toString("base64");
}

function decodeSignature(sig: string): Buffer | null {
  try {
    const b = /^[0-9a-f]{128}$/i.test(sig) ? Buffer.from(sig, "hex") : Buffer.from(sig, "base64");
    return b.length === 64 ? b : null;
  } catch {
    return null;
  }
}

/** Verifies a SEP-53 signature (or a raw ed25519 signature over the message, for older wallets). */
export function verifyMessage(address: string, message: string, signature: string): boolean {
  if (!StrKey.isValidEd25519PublicKey(address)) return false;
  const sig = decodeSignature(signature);
  if (!sig) return false;
  const kp = Keypair.fromPublicKey(address);
  try {
    return kp.verify(sep53Hash(message), sig) || kp.verify(Buffer.from(message, "utf8"), sig);
  } catch {
    return false;
  }
}

export interface SignedRequest {
  name: string;
  address: string;
  timestamp: number;
  signature: string;
}

/** Returns an error message, or null if the signed request is valid and fresh. */
export function checkSignedRequest(intent: Intent, r: SignedRequest, maxSkewSeconds: number, now = Date.now() / 1000): string | null {
  if (!StrKey.isValidEd25519PublicKey(r.address ?? "")) return "Invalid Stellar address";
  if (!Number.isFinite(r.timestamp)) return "Missing timestamp";
  if (Math.abs(now - r.timestamp) > maxSkewSeconds) return "Request expired — check your device clock and try again";
  if (!verifyMessage(r.address, buildMessage(intent, r.name, r.address, r.timestamp), r.signature ?? "")) return "Signature does not match this address";
  return null;
}
