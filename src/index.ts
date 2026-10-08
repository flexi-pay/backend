import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FileStore } from "./store.js";

const cfg = loadConfig();
const store = await FileStore.open(cfg.dataFile);
const server = buildApp(cfg, store);

server.listen(cfg.port, () => {
  console.log(`FlexiPay names service on :${cfg.port} — *${cfg.homeDomain} (${cfg.network}), ${store.count()} names`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
