import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  checklistPatchSchema,
  createSaveSchema,
  type GameDetail,
  type GameSummary,
  idSchema,
  lockRequestSchema,
  markerSchema,
  MAX_SRAM_BYTES,
  MAX_STATE_BYTES,
  MAX_THUMB_BYTES,
  notesSchema,
  renameSaveSchema,
  settingsSchema,
  slotSchema,
  unlockSchema,
} from "../shared/api.ts";
import type { Config } from "./config.ts";
import { openDb } from "./db.ts";
import {
  bytes,
  errorResponse,
  HttpError,
  json,
  noContent,
  parseParam,
  readBody,
  readJson,
  Router,
} from "./http.ts";
import { type GameEntry, type Library, loadLibrary } from "./library.ts";
import { securityHeaders, serveStatic } from "./static.ts";
import { Store } from "./store.ts";

export type App = {
  fetch: (req: Request) => Promise<Response>;
  store: Store;
  library: Library;
  close: () => void;
};

export function createApp(config: Config, opts: { now?: () => number } = {}): App {
  const library = loadLibrary(config.libraryDir);
  const db = openDb(resolve(config.dataDir, "pokeverse.db"));
  const store = new Store(
    db,
    config.dataDir,
    config.builtinChecklistDir,
    (gameId) => library.get(gameId)?.checklist ?? gameId,
    opts.now,
  );

  const game = (id: string | undefined): GameEntry => {
    const g = library.get(parseParam(idSchema, id, "game id"));
    if (!g) throw new HttpError(404, "Game not found");
    return g;
  };
  const save = (id: string | undefined) => {
    const saveId = parseParam(idSchema, id, "save id");
    const s = store.getSave(saveId);
    if (!s) throw new HttpError(404, "Save not found");
    return s;
  };
  const requireLock = (req: Request, saveId: string) => {
    if (!store.holdsLock(saveId, req.headers.get("x-client-id"))) {
      throw new HttpError(409, "This save is open on another device", undefined, {
        error: "not-lock-holder",
      });
    }
  };
  const summary = (g: GameEntry): GameSummary => ({
    id: g.id,
    title: g.title,
    region: g.region,
    mechanics: g.mechanics,
    hasRom: library.romPath(g) !== null,
    hasBoxArt: library.boxArtPath(g) !== null,
    guideUrl: g.guideUrl ?? null,
    hasMarkdownGuide: store.guideSections(g.id).length > 0,
    ...store.gameStats(g.id),
  });

  const api = new Router()
    .on("GET", "/api/health", () =>
      json({ ok: true, games: library.games.length, libraryError: library.error }),
    )

    // ----- library -----
    .on("GET", "/api/games", () =>
      json({ games: library.games.map(summary), error: library.error }),
    )
    .on("GET", "/api/continue", () => {
      const s = store.lastPlayed();
      const g = s ? library.get(s.gameId) : undefined;
      return json(s && g ? { game: summary(g), save: s } : null);
    })
    .on("GET", "/api/games/:id", (_req, p) => {
      const g = game(p.id);
      const detail: GameDetail = {
        ...summary(g),
        saves: store.listSaves(g.id),
        hasBios: library.biosPath() !== null,
      };
      return json(detail);
    })
    .on("GET", "/api/games/:id/rom", (_req, p) => {
      const path = library.romPath(game(p.id));
      if (!path) throw new HttpError(404, "ROM file not found on disk");
      return new Response(Bun.file(path), {
        headers: {
          "content-type": "application/octet-stream",
          "cache-control": "private, max-age=3600",
        },
      });
    })
    .on("GET", "/api/games/:id/boxart", (_req, p) => {
      const path = library.boxArtPath(game(p.id));
      if (!path) throw new HttpError(404, "No box art");
      return new Response(Bun.file(path), {
        headers: { "cache-control": "private, max-age=3600" },
      });
    })
    .on("GET", "/api/bios", () => {
      const path = library.biosPath();
      if (!path) throw new HttpError(404, "No BIOS installed");
      return new Response(Bun.file(path), {
        headers: {
          "content-type": "application/octet-stream",
          "cache-control": "private, max-age=86400",
        },
      });
    })
    .on("GET", "/api/games/:id/guide", (_req, p) =>
      json({ sections: store.guideSections(game(p.id).id) }),
    )

    // ----- saves -----
    .on("GET", "/api/games/:id/saves", (_req, p) => json(store.listSaves(game(p.id).id)))
    .on("POST", "/api/games/:id/saves", async (req, p) => {
      const g = game(p.id);
      const { name } = await readJson(req, createSaveSchema);
      return json(store.createSave(g.id, name), { status: 201 });
    })
    .on("GET", "/api/saves/:id", (_req, p) => json(save(p.id)))
    .on("PATCH", "/api/saves/:id", async (req, p) => {
      const s = save(p.id);
      const { name } = await readJson(req, renameSaveSchema);
      return json(store.renameSave(s.id, name));
    })

    // ----- locks -----
    .on("POST", "/api/saves/:id/lock", async (req, p) => {
      const s = save(p.id);
      const body = await readJson(req, lockRequestSchema);
      const result = store.acquireLock(s.id, body);
      return result.ok
        ? json(result.lock)
        : json({ error: "locked", heldBy: result.heldBy }, { status: 409 });
    })
    // POST (not DELETE) so navigator.sendBeacon can release on page unload.
    .on("POST", "/api/saves/:id/unlock", async (req, p) => {
      const s = save(p.id);
      const { clientId } = await readJson(req, unlockSchema);
      store.releaseLock(s.id, clientId);
      return noContent();
    })

    // ----- SRAM -----
    .on("GET", "/api/saves/:id/sram", (_req, p) => {
      const data = store.readSram(save(p.id).id);
      return data ? bytes(data) : noContent();
    })
    .on("PUT", "/api/saves/:id/sram", async (req, p) => {
      const s = save(p.id);
      requireLock(req, s.id);
      let data = await readBody(req, MAX_SRAM_BYTES);
      if (req.headers.get("x-sram-encoding") === "gzip") {
        try {
          data = new Uint8Array(gunzipSync(data, { maxOutputLength: MAX_SRAM_BYTES }));
        } catch {
          throw new HttpError(400, "SRAM is not valid gzip or exceeds the size limit");
        }
      }
      if (data.byteLength === 0) throw new HttpError(400, "Empty SRAM");
      return json({ updatedAt: store.writeSram(s.id, data) });
    })

    // ----- save states -----
    .on("GET", "/api/saves/:id/states", (_req, p) => json(store.listStates(save(p.id).id)))
    .on("GET", "/api/saves/:id/states/:slot", (_req, p) => {
      const data = store.readState(save(p.id).id, parseParam(slotSchema, p.slot, "slot"));
      if (!data) throw new HttpError(404, "Empty slot");
      return bytes(data);
    })
    .on("PUT", "/api/saves/:id/states/:slot", async (req, p) => {
      const s = save(p.id);
      const slot = parseParam(slotSchema, p.slot, "slot");
      requireLock(req, s.id);
      const data = await readBody(req, MAX_STATE_BYTES);
      if (data.byteLength === 0) throw new HttpError(400, "Empty state");
      return json(store.writeState(s.id, slot, data));
    })
    .on("GET", "/api/saves/:id/states/:slot/thumbnail", (_req, p) => {
      const data = store.readThumbnail(save(p.id).id, parseParam(slotSchema, p.slot, "slot"));
      if (!data) throw new HttpError(404, "No thumbnail");
      return bytes(data, "image/png");
    })
    .on("PUT", "/api/saves/:id/states/:slot/thumbnail", async (req, p) => {
      const s = save(p.id);
      const slot = parseParam(slotSchema, p.slot, "slot");
      requireLock(req, s.id);
      const data = await readBody(req, MAX_THUMB_BYTES);
      // PNG signature check: only ever serve back what is actually a PNG.
      const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (!sig.every((b, i) => data[i] === b)) throw new HttpError(400, "Thumbnail must be a PNG");
      if (!store.writeThumbnail(s.id, slot, data)) throw new HttpError(404, "Empty slot");
      return noContent();
    })

    // ----- checklist / notes / guide marker -----
    .on("GET", "/api/saves/:id/checklist", (_req, p) => {
      const s = save(p.id);
      const template = store.checklistTemplateFor(s.gameId);
      if (!template) throw new HttpError(404, "No checklist for this game");
      return json({ template, checked: store.checkedItems(s.id) });
    })
    .on("PATCH", "/api/saves/:id/checklist", async (req, p) => {
      const s = save(p.id);
      const { itemId, checked } = await readJson(req, checklistPatchSchema);
      const template = store.checklistTemplateFor(s.gameId);
      if (!template?.items.some((i) => i.id === itemId))
        throw new HttpError(400, "Unknown checklist item");
      store.setChecked(s.id, itemId, checked);
      return json({
        checked: store.checkedItems(s.id),
        summary: store.checklistSummary(s.id, s.gameId),
      });
    })
    .on("GET", "/api/saves/:id/notes", (_req, p) => json(store.getNotes(save(p.id).id)))
    .on("PUT", "/api/saves/:id/notes", async (req, p) => {
      const s = save(p.id);
      const { body } = await readJson(req, notesSchema);
      return json(store.setNotes(s.id, body));
    })
    .on("GET", "/api/saves/:id/marker", (_req, p) => json(store.getMarker(save(p.id).id)))
    .on("PUT", "/api/saves/:id/marker", async (req, p) => {
      const s = save(p.id);
      const { sectionId } = await readJson(req, markerSchema);
      return json(store.setMarker(s.id, sectionId));
    })

    // ----- settings -----
    .on("GET", "/api/settings", () => json(store.getSettings()))
    .on("PUT", "/api/settings", async (req) =>
      json(store.setSettings(await readJson(req, settingsSchema))),
    );

  return {
    store,
    library,
    close: () => db.close(),
    async fetch(req) {
      const url = new URL(req.url);
      let res: Response;
      try {
        if (url.pathname.startsWith("/api/")) {
          res = (await api.handle(req, url)) ?? json({ error: "Not found" }, { status: 404 });
        } else {
          res = await serveStatic(config.staticDir, url.pathname, req.method);
        }
      } catch (e) {
        res = errorResponse(e);
      }
      return securityHeaders(res, url.pathname);
    },
  };
}
