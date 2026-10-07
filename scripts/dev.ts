// Runs the API (watch mode) and the Vite dev server together; Ctrl-C stops both.
import { existsSync } from "node:fs";

if (!existsSync("public/vendor/ejs/loader.js")) {
  await Bun.spawn(["bun", "scripts/vendor-emulator.ts"], {
    stdio: ["inherit", "inherit", "inherit"],
  }).exited;
}
const procs = [
  Bun.spawn(["bun", "--watch", "server/index.ts"], { stdio: ["inherit", "inherit", "inherit"] }),
  Bun.spawn(["bunx", "--bun", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(procs.map((p) => p.exited));
stop();
