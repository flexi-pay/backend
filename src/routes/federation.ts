// SEP-2 federation: resolves "alice*flexipay.app" ⇄ G… so any Stellar wallet can pay a name.
import { StrKey } from "@stellar/stellar-sdk";
import type { Config } from "../config.js";
import { error, json, type Router } from "../http.js";
import { parseStellarAddress } from "../names.js";
import type { NameRecord, NameStore } from "../store.js";

export function federationRecord(rec: NameRecord, domain: string) {
  return {
    stellar_address: `${rec.name}*${domain}`,
    account_id: rec.address,
    ...(rec.memo ? { memo_type: rec.memoType ?? "text", memo: rec.memo } : {}),
  };
}

export function federationRoutes(router: Router, cfg: Config, store: NameStore) {
  router.get("/federation", (req) => {
    const q = req.query.get("q") ?? "";
    const type = req.query.get("type") ?? "";
    if (type === "name") {
      const parsed = parseStellarAddress(q);
      if (!parsed) return error(400, "q must look like name*domain");
      if (parsed.domain !== cfg.homeDomain) return error(404, `This server only resolves *${cfg.homeDomain} names`);
      const rec = store.get(parsed.name);
      return rec ? json(federationRecord(rec, cfg.homeDomain)) : error(404, "Name not found");
    }
    if (type === "id") {
      if (!StrKey.isValidEd25519PublicKey(q)) return error(400, "q must be a Stellar account ID");
      const rec = store.byAddress(q);
      return rec ? json(federationRecord(rec, cfg.homeDomain)) : error(404, "No name for this account");
    }
    if (type === "txid" || type === "forward") return error(501, `type=${type} is not supported`);
    return error(400, "type must be name or id");
  });
}
