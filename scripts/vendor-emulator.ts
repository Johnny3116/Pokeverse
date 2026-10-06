// Copies EmulatorJS + the mGBA core out of node_modules into public/vendor/ejs so the
// emulator is served from this app (never from the EmulatorJS CDN).
//
// The npm package ships unminified sources; we concatenate them into the
// emulator.min.js/.css names the loader asks for, which also keeps the loader out of
// its debug mode.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ejs = resolve(root, "node_modules/@emulatorjs/emulatorjs/data");
const core = resolve(root, "node_modules/@emulatorjs/core-mgba");
const out = resolve(root, "public/vendor/ejs");

// Order matches data/loader.js.
const SCRIPTS = [
  "emulator.js",
  "nipplejs.js",
  "shaders.js",
  "storage.js",
  "gamepad.js",
  "GameManager.js",
  "socket.io.min.js",
  "compression.js",
];
const CORE_FILES = ["mgba-wasm.data", "mgba-legacy-wasm.data"];

if (!existsSync(ejs) || !existsSync(core)) {
  console.error("EmulatorJS packages missing; run `bun install` first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
const copy = (from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};

copy(resolve(ejs, "loader.js"), resolve(out, "loader.js"));
copy(resolve(ejs, "version.json"), resolve(out, "version.json"));
// EmulatorJS phones its CDN for update checks when served from localhost. The app's
// CSP blocks that anyway; removing the call keeps the console clean.
const UPDATE_CHECK =
  'if (this.debug || (window.location && ["localhost", "127.0.0.1"].includes(location.hostname))) this.checkForUpdates();';
const bundle = SCRIPTS.map(
  (f) => `/* ${f} */\n${readFileSync(resolve(ejs, "src", f), "utf8")}`,
).join(";\n");
if (!bundle.includes(UPDATE_CHECK))
  throw new Error("EmulatorJS changed: update-check patch no longer applies");
writeFileSync(
  resolve(out, "emulator.min.js"),
  bundle.replace(UPDATE_CHECK, "/* update check removed by PokeVerse */"),
);
copy(resolve(ejs, "emulator.css"), resolve(out, "emulator.min.css"));
for (const f of ["extract7z.js", "extractzip.js"])
  copy(resolve(ejs, "compression", f), resolve(out, "compression", f));
for (const f of CORE_FILES) copy(resolve(core, f), resolve(out, "cores", f));
copy(resolve(core, "reports/mgba.json"), resolve(out, "cores/reports/mgba.json"));
copy(resolve(ejs, "../LICENSE"), resolve(out, "LICENSE-EmulatorJS.txt"));

const version = JSON.parse(readFileSync(resolve(ejs, "../package.json"), "utf8")).version;
console.log(`[vendor] EmulatorJS ${version} + mGBA core -> public/vendor/ejs`);
