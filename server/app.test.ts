import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DEFAULT_SETTINGS, LOCK_TTL_MS } from "../shared/api.ts";
import { type App, createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { safeJoin } from "./files.ts";
import { SRAM_HISTORY } from "./store.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let dir: string;
let app: App;
let clock = 1_000_000;

function setup(manifest: unknown = defaultManifest()) {
  dir = mkdtempSync(resolve(tmpdir(), "pokeverse-test-"));
  const lib = resolve(dir, "library");
  mkdirSync(resolve(lib, "roms"), { recursive: true });
  mkdirSync(resolve(lib, "boxart"), { recursive: true });
  writeFileSync(resolve(lib, "roms", "test.gba"), new Uint8Array([1, 2, 3, 4]));
  if (manifest !== null) writeFileSync(resolve(lib, "games.json"), JSON.stringify(manifest));
  mkdirSync(resolve(dir, "guides", "test-game"), { recursive: true });
  writeFileSync(
    resolve(dir, "guides", "test-game", "01-intro.md"),
    "# Littleroot Town\n\nStart here.",
  );
  writeFileSync(
    resolve(dir, "guides", "test-game", "02-route-101.md"),
    "Route text without heading",
  );
  mkdirSync(resolve(dir, "checklists"), { recursive: true });
  writeFileSync(
    resolve(dir, "checklists", "test-game.json"),
    JSON.stringify({
      gameId: "test-game",
      title: "Test",
      categories: ["Badges", "Pokédex"],
      items: [
        { id: "badge-stone", name: "Stone Badge", category: "Badges" },
        { id: "dex-001", name: "Bulbasaur", category: "Pokédex" },
        { id: "dex-002", name: "Ivysaur", category: "Pokédex" },
      ],
    }),
  );
  const config = { ...loadConfig({ DATA_DIR: dir }), staticDir: resolve(dir, "dist") };
  app = createApp(config, { now: () => clock });
}

function defaultManifest() {
  return {
    games: [
      {
        id: "test-game",
        title: "Test Game",
        region: "Hoenn",
        rom: "test.gba",
        guideUrl: "https://example.com/guide",
      },
      { id: "missing-rom", title: "Missing", rom: "nope.gba" },
    ],
  };
}

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers:
        body instanceof Uint8Array ? headers : { "content-type": "application/json", ...headers },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
            ? (body as Uint8Array<ArrayBuffer>)
            : JSON.stringify(body),
    }),
  );

async function newSave(name = "Main run") {
  const res = await req("POST", "/api/games/test-game/saves", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

beforeEach(() => {
  clock = 1_000_000;
  setup();
});
afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("library", () => {
  test("lists games with rom availability", async () => {
    const body = (await (await req("GET", "/api/games")).json()) as {
      games: { id: string; hasRom: boolean; hasMarkdownGuide: boolean }[];
    };
    expect(body.games.map((g) => [g.id, g.hasRom])).toEqual([
      ["test-game", true],
      ["missing-rom", false],
    ]);
    expect(body.games[0]!.hasMarkdownGuide).toBe(true);
  });

  test("streams the ROM and 404s when the file is missing", async () => {
    const ok = await req("GET", "/api/games/test-game/rom");
    expect(ok.status).toBe(200);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect((await req("GET", "/api/games/missing-rom/rom")).status).toBe(404);
    expect((await req("GET", "/api/games/nope/rom")).status).toBe(404);
  });

  test("rejects malformed ids instead of touching the filesystem", async () => {
    expect((await req("GET", "/api/games/..%2F..%2Fetc/rom")).status).toBe(400);
    expect((await req("GET", "/api/saves/BAD_ID/sram")).status).toBe(400);
  });

  test("reports an invalid manifest without crashing", async () => {
    app.close();
    rmSync(dir, { recursive: true, force: true });
    setup({ games: [{ id: "x", title: "X", rom: "../../etc/passwd" }] });
    const body = (await (await req("GET", "/api/games")).json()) as {
      games: unknown[];
      error: string;
    };
    expect(body.games).toEqual([]);
    expect(body.error).toContain("games.json is invalid");
  });

  test("safeJoin refuses traversal", () => {
    expect(() => safeJoin("/data", "../x")).toThrow();
    expect(() => safeJoin("/data", "a/b")).toThrow();
    expect(() => safeJoin("/data", "..")).toThrow();
    expect(safeJoin("/data", "ok.gba")).toBe("/data/ok.gba");
  });

  test("serves markdown guide sections in file order", async () => {
    const body = (await (await req("GET", "/api/games/test-game/guide")).json()) as {
      sections: { id: string; title: string }[];
    };
    expect(body.sections.map((s) => [s.id, s.title])).toEqual([
      ["01-intro", "Littleroot Town"],
      ["02-route-101", "route 101"],
    ]);
  });
});

describe("saves and locks", () => {
  test("unknown save is a 404, never a fallback", async () => {
    expect((await req("GET", "/api/saves/s-doesnotexist")).status).toBe(404);
  });

  test("second device is refused until it takes over", async () => {
    const { id } = await newSave();
    expect(
      (await req("POST", `/api/saves/${id}/lock`, { clientId: A, label: "Desktop" })).status,
    ).toBe(200);
    const conflict = await req("POST", `/api/saves/${id}/lock`, { clientId: B, label: "Phone" });
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { heldBy: { label: string } }).heldBy.label).toBe("Desktop");

    expect(
      (await req("POST", `/api/saves/${id}/lock`, { clientId: B, label: "Phone", takeover: true }))
        .status,
    ).toBe(200);
    // The old holder can no longer write.
    const write = await req("PUT", `/api/saves/${id}/sram`, new Uint8Array([9]), {
      "x-client-id": A,
    });
    expect(write.status).toBe(409);
  });

  test("an expired lease can be taken without takeover", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    clock += LOCK_TTL_MS + 1;
    expect((await req("POST", `/api/saves/${id}/lock`, { clientId: B })).status).toBe(200);
  });

  test("heartbeats credit capped playtime", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A, playedSec: 15 }); // first acquire: no credit
    await req("POST", `/api/saves/${id}/lock`, { clientId: A, playedSec: 15 });
    await req("POST", `/api/saves/${id}/lock`, { clientId: A, playedSec: 500 }); // capped at 60
    const save = (await (await req("GET", `/api/saves/${id}`)).json()) as {
      playtimeSec: number;
      lastPlayedAt: number;
    };
    expect(save.playtimeSec).toBe(75);
    expect(save.lastPlayedAt).toBe(clock);
  });

  test("unlock releases only for the holder", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    await req("POST", `/api/saves/${id}/unlock`, { clientId: B });
    expect((await req("POST", `/api/saves/${id}/lock`, { clientId: B })).status).toBe(409);
    await req("POST", `/api/saves/${id}/unlock`, { clientId: A });
    expect((await req("POST", `/api/saves/${id}/lock`, { clientId: B })).status).toBe(200);
  });

  test("continue points at the most recently played save", async () => {
    expect(await (await req("GET", "/api/continue")).json()).toBeNull();
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    const body = (await (await req("GET", "/api/continue")).json()) as {
      save: { id: string };
      game: { id: string };
    };
    expect([body.game.id, body.save.id]).toEqual(["test-game", id]);
  });

  test("validates save names", async () => {
    expect((await req("POST", "/api/games/test-game/saves", { name: "" })).status).toBe(400);
    expect((await req("POST", "/api/games/test-game/saves", { name: "x".repeat(61) })).status).toBe(
      400,
    );
    expect((await req("POST", "/api/games/test-game/saves", "nope")).status).toBe(400);
  });
});

describe("SRAM", () => {
  test("round-trips and keeps bounded history", async () => {
    const { id } = await newSave();
    expect((await req("GET", `/api/saves/${id}/sram`)).status).toBe(204);
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    for (let i = 0; i < SRAM_HISTORY + 5; i++) {
      clock += 1000;
      const res = await req("PUT", `/api/saves/${id}/sram`, new Uint8Array([i, i, i]), {
        "x-client-id": A,
      });
      expect(res.status).toBe(200);
    }
    const got = new Uint8Array(await (await req("GET", `/api/saves/${id}/sram`)).arrayBuffer());
    expect(got).toEqual(new Uint8Array([SRAM_HISTORY + 4, SRAM_HISTORY + 4, SRAM_HISTORY + 4]));
    expect(readdirSync(resolve(dir, "saves", id, "sram-history")).length).toBe(SRAM_HISTORY);
  });

  test("identical writes do not churn history", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    for (let i = 0; i < 3; i++)
      await req("PUT", `/api/saves/${id}/sram`, new Uint8Array([7]), { "x-client-id": A });
    expect(() => readdirSync(resolve(dir, "saves", id, "sram-history"))).toThrow();
  });

  test("accepts gzip uploads and refuses gzip bombs", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    const h = { "x-client-id": A, "x-sram-encoding": "gzip" };
    const sram = new Uint8Array(128 * 1024).fill(0xff);
    expect((await req("PUT", `/api/saves/${id}/sram`, Bun.gzipSync(sram), h)).status).toBe(200);
    expect(new Uint8Array(await (await req("GET", `/api/saves/${id}/sram`)).arrayBuffer())).toEqual(
      sram,
    );
    const bomb = Bun.gzipSync(new Uint8Array(4 * 1024 * 1024));
    expect((await req("PUT", `/api/saves/${id}/sram`, bomb, h)).status).toBe(400);
    expect((await req("PUT", `/api/saves/${id}/sram`, new Uint8Array([1, 2, 3]), h)).status).toBe(
      400,
    );
  });

  test("requires the lock and rejects oversized bodies", async () => {
    const { id } = await newSave();
    expect((await req("PUT", `/api/saves/${id}/sram`, new Uint8Array([1]))).status).toBe(409);
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    const big = new Uint8Array(512 * 1024 + 1);
    expect((await req("PUT", `/api/saves/${id}/sram`, big, { "x-client-id": A })).status).toBe(413);
  });
});

describe("save states", () => {
  test("slots, thumbnails, and validation", async () => {
    const { id } = await newSave();
    await req("POST", `/api/saves/${id}/lock`, { clientId: A });
    const h = { "x-client-id": A };
    expect((await req("PUT", `/api/saves/${id}/states/5`, new Uint8Array([1]), h)).status).toBe(
      400,
    );
    expect((await req("PUT", `/api/saves/${id}/states/2/thumbnail`, PNG, h)).status).toBe(404); // no state yet
    expect(
      (await req("PUT", `/api/saves/${id}/states/2`, new Uint8Array([4, 5, 6]), h)).status,
    ).toBe(200);
    expect(
      (await req("PUT", `/api/saves/${id}/states/2/thumbnail`, new Uint8Array([1, 2]), h)).status,
    ).toBe(400);
    expect((await req("PUT", `/api/saves/${id}/states/2/thumbnail`, PNG, h)).status).toBe(204);

    const list = (await (await req("GET", `/api/saves/${id}/states`)).json()) as {
      slot: number;
      hasThumbnail: boolean;
    }[];
    expect(list).toEqual([{ slot: 2, createdAt: clock, size: 3, hasThumbnail: true }] as never);
    expect(
      new Uint8Array(await (await req("GET", `/api/saves/${id}/states/2`)).arrayBuffer()),
    ).toEqual(new Uint8Array([4, 5, 6]));
    expect(
      (await req("GET", `/api/saves/${id}/states/2/thumbnail`)).headers.get("content-type"),
    ).toBe("image/png");
    expect((await req("GET", `/api/saves/${id}/states/1`)).status).toBe(404);

    // Overwriting a slot drops the stale thumbnail.
    await req("PUT", `/api/saves/${id}/states/2`, new Uint8Array([7]), h);
    expect((await req("GET", `/api/saves/${id}/states/2/thumbnail`)).status).toBe(404);
  });
});

describe("checklist, notes, marker, settings", () => {
  test("checklist progress is per save", async () => {
    const one = await newSave("One");
    const two = await newSave("Two");
    const patch = await req("PATCH", `/api/saves/${one.id}/checklist`, {
      itemId: "dex-001",
      checked: true,
    });
    expect(((await patch.json()) as { summary: unknown }).summary).toEqual({
      done: 1,
      total: 3,
      dexDone: 1,
      dexTotal: 2,
    });
    expect(
      (await req("PATCH", `/api/saves/${one.id}/checklist`, { itemId: "made-up", checked: true }))
        .status,
    ).toBe(400);
    const other = (await (await req("GET", `/api/saves/${two.id}/checklist`)).json()) as {
      checked: object;
    };
    expect(other.checked).toEqual({});
    await req("PATCH", `/api/saves/${one.id}/checklist`, { itemId: "dex-001", checked: false });
    const after = (await (await req("GET", `/api/saves/${one.id}/checklist`)).json()) as {
      checked: object;
    };
    expect(after.checked).toEqual({});
  });

  test("notes and guide marker", async () => {
    const { id } = await newSave();
    expect(await (await req("GET", `/api/saves/${id}/notes`)).json()).toEqual({
      body: "",
      updatedAt: null,
    });
    await req("PUT", `/api/saves/${id}/notes`, { body: "Team: Marshtomp" });
    expect(
      ((await (await req("GET", `/api/saves/${id}/notes`)).json()) as { body: string }).body,
    ).toBe("Team: Marshtomp");
    await req("PUT", `/api/saves/${id}/marker`, { sectionId: "02-route-101" });
    const save = (await (await req("GET", `/api/saves/${id}`)).json()) as { location: string };
    expect(save.location).toBe("02-route-101");
  });

  test("settings default, validate, and persist", async () => {
    expect(await (await req("GET", "/api/settings")).json()).toEqual(DEFAULT_SETTINGS);
    expect((await req("PUT", "/api/settings", { ...DEFAULT_SETTINGS, volume: 4 })).status).toBe(
      400,
    );
    const next = { ...DEFAULT_SETTINGS, volume: 0.25, viewMode: "Theater" };
    expect((await req("PUT", "/api/settings", next)).status).toBe(200);
    expect(await (await req("GET", "/api/settings")).json()).toEqual(next);
  });
});

describe("static + headers", () => {
  test("SPA fallback, 404 for missing assets, CSP on html", async () => {
    mkdirSync(resolve(dir, "dist", "assets"), { recursive: true });
    writeFileSync(resolve(dir, "dist", "index.html"), "<!doctype html><title>x</title>");
    writeFileSync(resolve(dir, "dist", "emulator.html"), "<!doctype html><title>emu</title>");
    writeFileSync(resolve(dir, "dist", "assets", "a.js"), "1");

    const page = await req("GET", "/play/test-game/s-123");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const emu = await req("GET", "/emulator.html");
    expect(emu.headers.get("content-security-policy")).toContain("wasm-unsafe-eval");
    expect(emu.headers.get("content-security-policy")).toContain("connect-src 'self' blob: data:");
    expect((await req("GET", "/assets/a.js")).headers.get("cache-control")).toContain("immutable");
    expect((await req("GET", "/assets/missing.js")).status).toBe(404);
    // URL parsing collapses dot segments, so this resolves inside the static root and
    // falls back to the SPA shell; it must never return the host file.
    expect(await (await req("GET", "/%2e%2e/%2e%2e/etc/passwd")).text()).toContain(
      "<title>x</title>",
    );
    expect((await req("GET", "/api/nope")).status).toBe(404);
    expect((await req("DELETE", "/api/settings")).status).toBe(405);
  });
});
