// Runs inside /emulator.html (same-origin iframe). Boots EmulatorJS with the mGBA
// core, keeps SRAM synced to the server, and answers commands from the Play page.
import type { FromHost, HostInit, ToHost } from "../../shared/emulator-protocol";
import { gzip } from "./gzip";

type GameManager = {
  getSaveFile(flush?: boolean): Uint8Array | null;
  getSaveFilePath(): string;
  loadSaveFiles(): void;
  restart(): void;
  getState(): Uint8Array;
  loadState(state: Uint8Array): void;
  screenshot(): Promise<Uint8Array>;
  setFastForwardRatio(ratio: number): void;
  toggleFastForward(active: 0 | 1): void;
  FS: {
    analyzePath(p: string): { exists: boolean };
    mkdir(p: string): void;
    unlink(p: string): void;
    writeFile(p: string, data: Uint8Array): void;
  };
};
type Emulator = {
  gameManager: GameManager;
  started: boolean;
  paused: boolean;
  isFastForward: boolean;
  play(): void;
  pause(): void;
  setVolume(v: number): void;
  on(event: string, fn: (e?: unknown) => void): void;
  elements: { parent: HTMLElement };
};
type EjsWindow = Window & Record<string, unknown> & { EJS_emulator?: Emulator };
const w = window as unknown as EjsWindow;

/** Poll interval for SRAM changes. An upload needs two identical polls in a row,
 * so a save that is mid-write in the game is never uploaded torn. */
const SRAM_POLL_MS = 2000;

// RetroPad indices used by EmulatorJS for GBA buttons.
const RETRO_INDEX: Record<string, number> = {
  B: 0,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  L: 10,
  R: 11,
};

const statusEl = document.getElementById("status")!;
const post = (msg: FromHost, transfer: Transferable[] = []) =>
  window.parent.postMessage(msg, location.origin, transfer);
const status = (text: string) => {
  statusEl.textContent = text;
  statusEl.style.display = text ? "grid" : "none";
  post({ type: "status", text });
};

let init: HostInit | null = null;
let emu: Emulator | null = null;
let lastUploaded: Uint8Array | null = null;
let pendingCandidate: Uint8Array | null = null;
let lockLost = false;
let uploading: Promise<void> | null = null;
let dirty = false;

const setDirty = (d: boolean) => {
  if (d === dirty) return;
  dirty = d;
  post({ type: "sram-dirty", dirty: d });
};

const equal = (a: Uint8Array | null, b: Uint8Array | null) => {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
};

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers as Record<string, string>), "x-client-id": init!.clientId },
  });
  return res;
}

async function uploadSram(data: Uint8Array, keepalive = false): Promise<void> {
  if (lockLost || !init) return;
  const body = await gzip(data);
  const res = await api(`/api/saves/${init.saveId}/sram`, {
    method: "PUT",
    body: body as BodyInit,
    keepalive: keepalive && body.byteLength < 60_000,
    headers: { "content-type": "application/octet-stream", "x-sram-encoding": "gzip" },
  });
  if (res.ok) {
    lastUploaded = data;
    setDirty(false);
    post({ type: "sram-saved", at: ((await res.json()) as { updatedAt: number }).updatedAt });
  } else {
    const conflict = res.status === 409;
    if (conflict) lockLost = true;
    post({
      type: "sram-error",
      message: conflict ? "Save is open on another device" : `Save failed (${res.status})`,
      lockLost: conflict,
    });
  }
}

/** Read SRAM; upload once it is stable across two polls and differs from the server copy. */
async function pollSram(force = false) {
  if (!emu?.started || lockLost) return;
  if (uploading) {
    if (!force) return;
    await uploading; // a flush must not ack before an in-flight upload lands
  }
  let current: Uint8Array | null;
  try {
    current = emu.gameManager.getSaveFile(true);
  } catch {
    return;
  }
  if (!current || current.byteLength === 0) return;
  current = new Uint8Array(current); // copy out of the WASM heap
  if (equal(current, lastUploaded)) {
    pendingCandidate = null;
    setDirty(false);
    return;
  }
  setDirty(true);
  if (!force && !equal(current, pendingCandidate)) {
    pendingCandidate = current;
    return;
  }
  pendingCandidate = null;
  const data = current;
  uploading = uploadSram(data, force)
    .catch((e: Error) =>
      post({ type: "sram-error", message: `Save failed: ${e.message}`, lockLost: false }),
    )
    .finally(() => {
      uploading = null;
    });
  await uploading;
}

function writeSramIntoCore(data: Uint8Array) {
  const gm = emu!.gameManager;
  const path = gm.getSaveFilePath();
  let cur = "";
  for (const part of path.split("/").slice(0, -1)) {
    if (!part) continue;
    cur += `/${part}`;
    if (!gm.FS.analyzePath(cur).exists) gm.FS.mkdir(cur);
  }
  if (gm.FS.analyzePath(path).exists) gm.FS.unlink(path);
  gm.FS.writeFile(path, data);
  gm.loadSaveFiles();
  // Reboot so the game sees the save from its first frame.
  gm.restart();
}

function controls(cfg: HostInit) {
  const p0: Record<number, { value: string; value2: string }> = {};
  for (const [button, idx] of Object.entries(RETRO_INDEX)) {
    p0[idx] = { value: cfg.keyBindings[button] ?? "", value2: cfg.padBindings[button] ?? "" };
  }
  return { 0: p0, 1: {}, 2: {}, 3: {} };
}

async function boot(cfg: HostInit) {
  init = cfg;
  status("Fetching save…");
  const sramRes = await api(`/api/saves/${cfg.saveId}/sram`);
  const sram = sramRes.status === 200 ? new Uint8Array(await sramRes.arrayBuffer()) : null;
  lastUploaded = sram;

  status("Loading emulator…");
  Object.assign(w, {
    EJS_player: "#game",
    EJS_core: "gba",
    EJS_gameName: cfg.gameId,
    EJS_gameID: cfg.gameId,
    EJS_gameUrl: `/api/games/${cfg.gameId}/rom`,
    EJS_biosUrl: cfg.hasBios ? "/api/bios" : "",
    EJS_pathtodata: "/vendor/ejs/",
    EJS_startOnLoaded: true,
    EJS_disableDatabases: true,
    EJS_disableLocalStorage: true,
    EJS_disableAutoLang: false,
    EJS_volume: cfg.muted ? 0 : cfg.volume,
    EJS_color: "#7dd3c0",
    EJS_backgroundColor: "#0b1016",
    EJS_defaultControls: controls(cfg),
    EJS_defaultOptions: { "save-save-interval": "0", "ff-ratio": String(cfg.fastForwardRatio) },
    EJS_Buttons: Object.fromEntries(
      [
        "playPause",
        "restart",
        "mute",
        "settings",
        "fullscreen",
        "saveState",
        "loadState",
        "screenRecord",
        "gamepad",
        "cheat",
        "volume",
        "saveSavFiles",
        "loadSavFiles",
        "quickSave",
        "quickLoad",
        "screenshot",
        "cacheManager",
        "exitEmulation",
        "netplay",
        "diskButton",
      ].map((k) => [k, false]),
    ),
    EJS_onGameStart: () => {
      emu = w.EJS_emulator!;
      if (sram) writeSramIntoCore(sram);
      emu.gameManager.setFastForwardRatio(cfg.fastForwardRatio);
      status("");
      post({ type: "started" });
      setInterval(() => void pollSram(), SRAM_POLL_MS);
      emu.elements.parent.focus();
    },
  });

  const loader = document.createElement("script");
  loader.src = "/vendor/ejs/loader.js";
  loader.onerror = () => fail("Emulator files are missing (run `bun run vendor`).");
  document.body.appendChild(loader);
}

function fail(message: string) {
  status(message);
  post({ type: "error", message });
}

function setFastForward(on: boolean) {
  if (!emu?.started) return;
  emu.isFastForward = on;
  emu.gameManager.toggleFastForward(on ? 1 : 0);
  post({ type: "fast-forward", on });
}

async function saveState(slot: number) {
  if (!emu?.started || !init) return;
  const state = emu.gameManager.getState().slice();
  const res = await api(`/api/saves/${init.saveId}/states/${slot}`, {
    method: "PUT",
    body: state as BodyInit,
    headers: { "content-type": "application/octet-stream" },
  });
  if (!res.ok) {
    if (res.status === 409) lockLost = true;
    throw new Error(
      res.status === 409
        ? "Save is open on another device"
        : `Could not save state (${res.status})`,
    );
  }
  const png = await emu.gameManager.screenshot();
  await api(`/api/saves/${init.saveId}/states/${slot}/thumbnail`, {
    method: "PUT",
    body: png.slice() as BodyInit,
    headers: { "content-type": "image/png" },
  });
  post({ type: "state-saved", slot });
}

async function loadState(slot: number) {
  if (!emu?.started || !init) return;
  const res = await api(`/api/saves/${init.saveId}/states/${slot}`);
  if (!res.ok)
    throw new Error(
      res.status === 404 ? `Slot ${slot} is empty` : `Could not load state (${res.status})`,
    );
  emu.gameManager.loadState(new Uint8Array(await res.arrayBuffer()));
  post({ type: "state-loaded", slot });
}

async function handle(msg: ToHost) {
  switch (msg.type) {
    case "init":
      if (!init) await boot(msg.init);
      return;
    case "pause":
      emu?.pause();
      post({ type: "paused", paused: true });
      return;
    case "resume":
      emu?.play();
      post({ type: "paused", paused: false });
      return;
    case "set-fast-forward":
      setFastForward(msg.on);
      return;
    case "set-volume":
      emu?.setVolume(msg.muted ? 0 : msg.volume);
      return;
    case "save-state":
      await saveState(msg.slot);
      return;
    case "load-state":
      await loadState(msg.slot);
      return;
    case "screenshot": {
      if (!emu?.started) return;
      const png = (await emu.gameManager.screenshot()).slice();
      post({ type: "screenshot", png: png.buffer }, [png.buffer]);
      return;
    }
    case "flush-sram":
      try {
        await pollSram(true);
      } finally {
        post({ type: "flushed" });
      }
      return;
    case "lock-lost":
      lockLost = true;
      emu?.pause();
      return;
    case "focus":
      emu?.elements.parent.focus();
      return;
  }
}

window.addEventListener("message", (e: MessageEvent<ToHost>) => {
  if (e.origin !== location.origin || e.source !== window.parent) return;
  handle(e.data).catch((err: Error) => post({ type: "error", message: err.message }));
});

// Fast-forward toggle hotkey (keyboard focus lives inside this iframe while playing).
window.addEventListener(
  "keydown",
  (e) => {
    if (!init || e.repeat || !emu?.started) return;
    if (e.key === "`") {
      e.preventDefault();
      post({ type: "hotkey", action: "drawer" });
      return;
    }
    const name = e.key === " " ? "space" : e.key.toLowerCase();
    if (name === init.fastForwardKey) {
      e.preventDefault();
      setFastForward(!emu.isFastForward);
    }
  },
  true,
);

// Last-chance save when the tab is hidden or closed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void pollSram(true);
});
window.addEventListener("pagehide", () => void pollSram(true));

if (window.parent === window) {
  status("Open a game from the library to play.");
} else {
  post({ type: "host-ready" });
}
