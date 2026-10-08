import { Networks } from "@stellar/stellar-sdk";

export interface Config {
  port: number;
  homeDomain: string;
  publicUrl: string;
  network: "testnet" | "mainnet";
  networkPassphrase: string;
  dataFile: string;
  corsOrigins: string[];
  /** Max allowed clock skew for signed requests, in seconds. */
  maxSkewSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const network = env.STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const port = Number(env.PORT ?? 8080);
  return {
    port,
    homeDomain: (env.HOME_DOMAIN ?? "localhost").toLowerCase(),
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
    network,
    networkPassphrase: network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
    dataFile: env.DATA_FILE ?? "./data/names.json",
    corsOrigins: (env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
    maxSkewSeconds: Number(env.MAX_SKEW_SECONDS ?? 300),
  };
}
