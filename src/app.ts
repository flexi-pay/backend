import { createServer, type Server } from "node:http";
import type { Config } from "./config.js";
import { json, listener, Router } from "./http.js";
import { RateLimiter } from "./ratelimit.js";
import { federationRoutes } from "./routes/federation.js";
import { nameRoutes } from "./routes/names.js";
import { tomlRoutes } from "./routes/toml.js";
import type { NameStore } from "./store.js";

export function buildApp(cfg: Config, store: NameStore, limiter = new RateLimiter(30, 60_000)): Server {
  const router = new Router();
  router.get("/health", () => json({ ok: true, network: cfg.network, domain: cfg.homeDomain, names: store.count() }));
  tomlRoutes(router, cfg);
  federationRoutes(router, cfg, store);
  nameRoutes(router, cfg, store, limiter);
  return createServer(listener(router, { cors: cfg.corsOrigins, onError: (e) => console.error(e) }));
}
