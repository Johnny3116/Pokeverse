import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
assertWritable(config.dataDir);
const app = createApp(config);

/** Fail fast with a fix, instead of a SQLite stack trace, when /data is read-only. */
function assertWritable(dir: string) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = resolve(dir, `.write-test-${process.pid}`);
    writeFileSync(probe, "");
    rmSync(probe);
  } catch (e) {
    const uid = process.getuid?.() ?? "?";
    const gid = process.getgid?.() ?? "?";
    console.error(
      `[pokeverse] Data folder ${dir} is not writable by uid ${uid} (gid ${gid}): ${(e as Error).message}\n` +
        `Fix: chown -R ${uid}:${gid} <your data folder>, or set PUID/PGID in docker-compose to the folder's owner.`,
    );
    process.exit(1);
  }
}

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
