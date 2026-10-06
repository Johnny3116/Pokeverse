import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = createApp(config);

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  // Save states can be several MB; individual routes enforce tighter limits.
  maxRequestBodySize: 16 * 1024 * 1024,
  fetch: app.fetch,
  error(e) {
    console.error("[server]", e);
    return new Response("Internal server error", { status: 500 });
  },
});

console.log(
  `[pokeverse] listening on http://${server.hostname}:${server.port} · data=${config.dataDir} · games=${app.library.games.length}`,
);
if (app.library.error) console.warn(`[pokeverse] library: ${app.library.error}`);

const shutdown = () => {
  server.stop();
  app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
