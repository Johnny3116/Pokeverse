// End-to-end test: builds nothing itself; run `bun run build` first.
//
//   node scripts/e2e.mjs [--shots <dir>]
//
// Starts the real server against a throwaway data dir with homebrew test ROMs, then
// drives Chromium through the main workflows on two "devices". Set CHROME_PATH to use
// a specific browser binary.
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? resolve(process.argv[shotsArg + 1]) : null;
if (shots) mkdirSync(shots, { recursive: true });
const PORT = 3290 + Math.floor(Math.random() * 100);
const U = `http://127.0.0.1:${PORT}`;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = "/opt/pw-browsers";
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).filter((d) => d.startsWith("chromium-"))) {
      const p = `${pw}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"])
    if (existsSync(p)) return p;
  throw new Error("No Chromium found; set CHROME_PATH");
}

// ---------- fixture data dir ----------
const data = mkdtempSync(resolve(tmpdir(), "pokeverse-e2e-"));
const roms = resolve(data, "library/roms");
mkdirSync(roms, { recursive: true });
copyFileSync(resolve(root, "tests/fixtures/roms/hello.gba"), resolve(roms, "hello.gba"));
// mGBA picks the save type from the cartridge's game code; give the flash test ROM
// Emerald's code (BPEE) so it gets the same 128 KB flash Pokémon games use.
const flash = readFileSync(resolve(root, "tests/fixtures/roms/flash128.gba"));
flash.write("BPEE", 0xac, "ascii");
writeFileSync(resolve(roms, "flash1m.gba"), flash);
writeFileSync(
  resolve(data, "library/games.json"),
  JSON.stringify({
    games: [
      {
        id: "emerald",
        title: "Flash Test",
        region: "Hoenn",
        rom: "flash1m.gba",
        guideUrl: "https://example.com/",
      },
      {
        id: "radical-red",
        title: "Hello Test",
        region: "Kanto",
        rom: "hello.gba",
        mechanics: "modern",
      },
      { id: "firered", title: "FireRed", region: "Kanto", rom: "missing.gba" },
    ],
  }),
);
mkdirSync(resolve(data, "guides/emerald"), { recursive: true });
writeFileSync(
  resolve(data, "guides/emerald/01-littleroot.md"),
  "# Littleroot Town\n\nGrab your starter.\n",
);
writeFileSync(
  resolve(data, "guides/emerald/02-route-101.md"),
  "## Route 101\n\n- Help Prof. Birch\n",
);

// ---------- server ----------
const server = spawn("bun", ["server/index.ts"], {
  cwd: root,
  env: { ...process.env, DATA_DIR: data, PORT: String(PORT), NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`${U}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

// ---------- helpers ----------
let failures = 0;
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    failures++;
    console.log(
      `  ✗ ${name}\n      ${String(e?.message ?? e)
        .split("\n")
        .join("\n      ")}`,
    );
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const api = async (path, init) => {
  const r = await fetch(U + path, init);
  return r.headers.get("content-type")?.includes("json") ? r.json() : r;
};
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const problems = [];
const external = new Set();
async function device(name, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  ctx.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(U) && !u.startsWith("blob:") && !u.startsWith("data:")) external.add(u);
  });
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
    p.on("console", (m) => {
      // Headless Chrome has no audio gesture; that warning is expected.
      // Lock conflicts (409) are part of the tested flow; Chrome logs them as resource errors.
      if (m.type() === "error" && !/AudioContext|status of 409/.test(m.text()))
        problems.push(`[${name}] console: ${m.text().slice(0, 300)}`);
    });
  });
  return { ctx, page: await ctx.newPage() };
}
const emuFrame = (page) => page.frames().find((f) => f.url().includes("/emulator.html"));
const waitForSaved = (page, timeout = 20000) =>
  page.waitForFunction(
    () => /Saved \d/.test(document.querySelector("main")?.textContent ?? ""),
    null,
    { timeout },
  );

console.log(`PokeVerse e2e · ${U} · data=${data}`);
let saveId;
const A = await device("desktop");

await step("library lists games, flags the missing ROM", async () => {
  await A.page.goto(U + "/");
  await A.page.getByRole("button", { name: /Flash Test/ }).waitFor();
  assert(await A.page.getByText("no ROM").isVisible(), "missing-ROM badge not shown");
  await shot(A.page, "01-library-empty");
});

await step("create a save from the picker and boot the emulator", async () => {
  await A.page.getByRole("button", { name: /Flash Test/ }).click();
  await A.page.getByRole("button", { name: "+ New save" }).click();
  await A.page.getByLabel("Save name").fill("Main run");
  await A.page.getByRole("button", { name: "Create" }).click();
  await A.page.waitForURL(/\/play\/emerald\/s-/);
  saveId = A.page.url().split("/").pop();
  await A.page.waitForFunction(
    () => document.querySelector("iframe")?.contentDocument?.querySelector("canvas"),
    null,
    {
      timeout: 20000,
    },
  );
});

await step("in-game save (128 KB flash) autosaves to the server", async () => {
  await waitForSaved(A.page);
  const sram = await api(`/api/saves/${saveId}/sram`);
  assert(sram.status === 200, `sram status ${sram.status}`);
  const size = (await sram.arrayBuffer()).byteLength;
  assert(size === 131072, `expected 131072-byte flash save, got ${size}`);
  await shot(A.page, "02-play-normal");
});

await step("save state to slot 2 with thumbnail, then load it", async () => {
  await A.page.getByRole("button", { name: "2", exact: true }).click();
  await A.page.getByRole("button", { name: "Save", exact: true }).click();
  await A.page.getByText("Saved state to slot 2").waitFor({ timeout: 10000 });
  const states = await api(`/api/saves/${saveId}/states`);
  assert(
    states.length === 1 && states[0].slot === 2 && states[0].hasThumbnail,
    `states: ${JSON.stringify(states)}`,
  );
  await A.page.getByRole("button", { name: "Load", exact: true }).click();
  await A.page.getByText("Loaded slot 2").waitFor({ timeout: 10000 });
});

await step("guide tab renders Markdown and marks 'you are here'", async () => {
  await A.page.getByRole("tab", { name: "Guide" }).click();
  await A.page.getByRole("heading", { name: "Littleroot Town" }).waitFor();
  await A.page.getByRole("button", { name: "Mark here" }).click();
  await A.page.getByRole("button", { name: /You are here/ }).waitFor();
  assert(
    (await api(`/api/saves/${saveId}/marker`)).sectionId === "01-littleroot",
    "marker not saved",
  );
});

await step("checklist progress is stored per save", async () => {
  await A.page.getByRole("tab", { name: "Checklist" }).click();
  await A.page.getByLabel("Search checklist").fill("Stone");
  await A.page.getByRole("button", { name: /Stone Badge/ }).click();
  await A.page.waitForTimeout(400);
  const cl = await api(`/api/saves/${saveId}/checklist`);
  assert("badge-stone" in cl.checked, "badge not checked server-side");
  await A.page.getByLabel("Search checklist").fill("");
  await shot(A.page, "03-checklist");
});

await step("notes autosave", async () => {
  await A.page.getByRole("tab", { name: "Notes" }).click();
  await A.page.getByLabel("Notes for this save").fill("Team: Mudkip, Taillow");
  let body = "";
  for (let i = 0; i < 30 && body !== "Team: Mudkip, Taillow"; i++) {
    await A.page.waitForTimeout(200);
    body = (await api(`/api/saves/${saveId}/notes`)).body;
  }
  assert(body === "Team: Mudkip, Taillow", `notes not saved (got ${JSON.stringify(body)})`);
});

await step("reference tab shows the type chart", async () => {
  await A.page.getByRole("tab", { name: "Ref" }).click();
  await A.page.getByText("Gen 3 chart").waitFor();
  await shot(A.page, "04-reference");
});

await step("theater mode collapses the panel", async () => {
  await A.page.getByRole("button", { name: "Theater view" }).click();
  await A.page.waitForTimeout(400);
  assert(!(await A.page.getByRole("tab", { name: "Notes" }).isVisible()), "panel still visible");
  await shot(A.page, "05-theater");
  await A.page.getByRole("button", { name: "Normal view" }).click();
});

const B = await device("phone", { width: 390, height: 844 });
await step("second device sees the lock and can take over", async () => {
  await B.page.goto(`${U}/play/emerald/${saveId}`);
  await B.page.getByText("Open on another device").waitFor({ timeout: 10000 });
  await shot(B.page, "06-phone-lock");
  const sramLoad = B.page.waitForResponse(
    (r) => r.url().endsWith(`/api/saves/${saveId}/sram`) && r.request().method() === "GET",
  );
  await B.page.getByRole("button", { name: "Take over" }).click();
  assert((await sramLoad).status() === 200, "phone did not load the saved SRAM");
  await A.page.getByText("Taken over").waitFor({ timeout: 25000 });
  await shot(A.page, "07-desktop-taken-over");
});

await step("the device that lost the lock cannot write", async () => {
  const clientA = await A.page.evaluate(() => localStorage.getItem("pokeverse.clientId"));
  const r = await fetch(`${U}/api/saves/${saveId}/sram`, {
    method: "PUT",
    headers: { "x-client-id": clientA },
    body: new Uint8Array([1]),
  });
  assert(r.status === 409, `expected 409, got ${r.status}`);
});

await step("phone boots and renders at its width", async () => {
  await B.page.waitForFunction(
    () => document.querySelector("iframe")?.contentDocument?.querySelector("canvas"),
    null,
    {
      timeout: 20000,
    },
  );
  await B.page.waitForTimeout(1500);
  await shot(B.page, "08-phone-play");
  const overflow = await B.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert(overflow <= 0, `horizontal overflow ${overflow}px on phone`);
});

await step("leaving the play page releases the lock", async () => {
  await B.page.getByRole("link", { name: "Library" }).click();
  await B.page.waitForURL(U + "/");
  await B.page.waitForTimeout(500);
  const r = await api(`/api/saves/${saveId}/lock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: crypto.randomUUID(), label: "probe" }),
  });
  assert(r.clientId, `lock still held: ${JSON.stringify(r)}`);
  await api(`/api/saves/${saveId}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: r.clientId }),
  });
});

await step("library shows the continue card and playtime", async () => {
  await A.page.goto(U + "/");
  await A.page.getByRole("link", { name: /Resume Flash Test/ }).waitFor();
  await shot(A.page, "09-library-continue");
});

await step("settings: remap a key and persist it", async () => {
  await A.page.goto(U + "/settings");
  const row = A.page.locator("button", { hasText: /^X$/ }).first();
  await row.click();
  await A.page.keyboard.press("KeyK");
  await A.page.getByRole("button", { name: "Save changes" }).click();
  await A.page.getByRole("button", { name: "Saved" }).waitFor();
  assert((await api("/api/settings")).keyBindings.A === "k", "A not remapped to k");
  await shot(A.page, "10-settings");
});

await step("unknown save shows not found (no fallback)", async () => {
  await A.page.goto(`${U}/play/emerald/s-doesnotexist`);
  await A.page.getByText("Game or save not found").waitFor();
});

await step("no requests left the server", async () => {
  assert(external.size === 0, `external requests: ${[...external].join(", ")}`);
});
await step("no console errors", async () => {
  assert(problems.length === 0, problems.join("\n"));
});

await browser.close();
server.kill();
if (failures) {
  console.log(`\n${failures} step(s) failed. Server log:\n${serverLog}`);
  rmSync(data, { recursive: true, force: true });
  process.exit(1);
}
rmSync(data, { recursive: true, force: true });
console.log("\nAll e2e steps passed.");
