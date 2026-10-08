// SEP-1: stellar.toml advertises this domain's federation server to every Stellar wallet.
import type { Config } from "../config.js";
import type { Router } from "../http.js";

export function stellarToml(cfg: Config): string {
  return [
    `# FlexiPay — names for the Starling wallet`,
    `VERSION="2.7.0"`,
    `NETWORK_PASSPHRASE="${cfg.networkPassphrase}"`,
    `FEDERATION_SERVER="${cfg.publicUrl}/federation"`,
    ``,
    `[DOCUMENTATION]`,
    `ORG_NAME="FlexiPay"`,
    `ORG_URL="https://${cfg.homeDomain}"`,
    ``,
  ].join("\n");
}

export function tomlRoutes(router: Router, cfg: Config) {
  const toml = stellarToml(cfg);
  router.get("/.well-known/stellar.toml", () => ({
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
    body: toml,
  }));
}
