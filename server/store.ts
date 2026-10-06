import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ChecklistSummary,
  type ChecklistTemplate,
  checklistTemplateSchema,
  DEFAULT_SETTINGS,
  type GuideSection,
  LOCK_TTL_MS,
  type LockInfo,
  type LockRequest,
  lockRequestSchema,
  type SaveFile,
  type SaveStateInfo,
  type Settings,
  settingsSchema,
} from "../shared/api.ts";
import { atomicWrite, isFile, pruneOldest, safeJoin } from "./files.ts";

/** How many previous SRAM versions to keep per save. */
export const SRAM_HISTORY = 20;
/** Max playtime credited per heartbeat, so a stalled client can't inflate it. */
const MAX_PLAYED_PER_BEAT = 60;

type SaveRow = {
  id: string;
  game_id: string;
  name: string;
  created_at: number;
  last_played_at: number | null;
  playtime_sec: number;
  sram_updated_at: number | null;
  lock_client: string | null;
  lock_label: string | null;
  lock_expires_at: number | null;
};

export type LockResult = { ok: true; lock: LockInfo } | { ok: false; heldBy: LockInfo };

export class Store {
  private checklistCache = new Map<string, ChecklistTemplate | null>();

  constructor(
    readonly db: Database,
    readonly dataDir: string,
    private readonly builtinChecklistDir: string,
    /** Maps a game id to its checklist template id (games.json may override it). */
    private readonly templateIdFor: (gameId: string) => string = (id) => id,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------- paths (ids are validated + looked up in the DB before reaching here) ----------

  private saveDir(saveId: string) {
    return safeJoin(resolve(this.dataDir, "saves"), saveId);
  }
  private sramPath(saveId: string) {
    return resolve(this.saveDir(saveId), "sram.sav");
  }
  private statePath(saveId: string, slot: number) {
    return resolve(this.saveDir(saveId), "states", `${slot}.state`);
  }
  private thumbPath(saveId: string, slot: number) {
    return resolve(this.saveDir(saveId), "states", `${slot}.png`);
  }

  // ---------- saves ----------

  private row(saveId: string): SaveRow | null {
    return this.db.query("SELECT * FROM saves WHERE id = ?").get(saveId) as SaveRow | null;
  }

  exists(saveId: string): boolean {
    return this.row(saveId) !== null;
  }

  getSave(saveId: string): SaveFile | null {
    const r = this.row(saveId);
    return r ? this.toSave(r) : null;
  }

  listSaves(gameId: string): SaveFile[] {
    const rows = this.db
      .query(
        "SELECT * FROM saves WHERE game_id = ? ORDER BY COALESCE(last_played_at, created_at) DESC",
      )
      .all(gameId) as SaveRow[];
    return rows.map((r) => this.toSave(r));
  }

  lastPlayed(): SaveFile | null {
    const r = this.db
      .query(
        "SELECT * FROM saves WHERE last_played_at IS NOT NULL ORDER BY last_played_at DESC LIMIT 1",
      )
      .get() as SaveRow | null;
    return r ? this.toSave(r) : null;
  }

  gameStats(gameId: string) {
    return this.db
      .query(
        "SELECT COUNT(*) AS saveCount, COALESCE(SUM(playtime_sec),0) AS playtimeSec, MAX(last_played_at) AS lastPlayedAt FROM saves WHERE game_id = ?",
      )
      .get(gameId) as { saveCount: number; playtimeSec: number; lastPlayedAt: number | null };
  }

  createSave(gameId: string, name: string): SaveFile {
    const id = `s-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    this.db
      .query("INSERT INTO saves (id, game_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(id, gameId, name, this.now());
    return this.getSave(id)!;
  }

  renameSave(saveId: string, name: string): SaveFile | null {
    this.db.query("UPDATE saves SET name = ? WHERE id = ?").run(name, saveId);
    return this.getSave(saveId);
  }

  private toSave(r: SaveRow): SaveFile {
    const marker = this.getMarker(r.id).sectionId;
    return {
      id: r.id,
      gameId: r.game_id,
      name: r.name,
      createdAt: r.created_at,
      lastPlayedAt: r.last_played_at,
      playtimeSec: r.playtime_sec,
      hasSram: r.sram_updated_at !== null,
      sramUpdatedAt: r.sram_updated_at,
      location: marker,
      checklist: this.checklistSummary(r.id, r.game_id),
    };
  }

  // ---------- locks ----------

  acquireLock(saveId: string, input: LockRequest): LockResult {
    const req = lockRequestSchema.parse(input);
    const now = this.now();
    return this.db.transaction((): LockResult => {
      const r = this.row(saveId)!;
      const heldByOther =
        r.lock_client !== null && r.lock_client !== req.clientId && (r.lock_expires_at ?? 0) > now;
      if (heldByOther && !req.takeover) {
        return {
          ok: false,
          heldBy: {
            clientId: r.lock_client!,
            label: r.lock_label ?? "",
            expiresAt: r.lock_expires_at!,
          },
        };
      }
      const credit =
        r.lock_client === req.clientId ? Math.min(req.playedSec, MAX_PLAYED_PER_BEAT) : 0;
      const expiresAt = now + LOCK_TTL_MS;
      this.db
        .query(
          `UPDATE saves SET lock_client = ?, lock_label = ?, lock_expires_at = ?,
             last_played_at = ?, playtime_sec = playtime_sec + ? WHERE id = ?`,
        )
        .run(req.clientId, req.label, expiresAt, now, credit, saveId);
      return { ok: true, lock: { clientId: req.clientId, label: req.label, expiresAt } };
    })();
  }

  releaseLock(saveId: string, clientId: string): void {
    this.db
      .query(
        "UPDATE saves SET lock_client = NULL, lock_label = NULL, lock_expires_at = NULL WHERE id = ? AND lock_client = ?",
      )
      .run(saveId, clientId);
  }

  /**
   * Writes require holding the lock. An expired lease still counts as long as nobody
   * else has taken it: background tabs get their heartbeat timers throttled, and the
   * lease only exists to arbitrate between devices.
   */
  holdsLock(saveId: string, clientId: string | null): boolean {
    if (!clientId) return false;
    return this.row(saveId)?.lock_client === clientId;
  }

  // ---------- SRAM ----------

  readSram(saveId: string): Uint8Array | null {
    const p = this.sramPath(saveId);
    return isFile(p) ? readFileSync(p) : null;
  }

  writeSram(saveId: string, data: Uint8Array): number {
    const now = this.now();
    const current = this.sramPath(saveId);
    if (isFile(current)) {
      const prev = readFileSync(current);
      if (Buffer.compare(prev, Buffer.from(data)) === 0) return now; // unchanged, skip history churn
      const histDir = resolve(this.saveDir(saveId), "sram-history");
      atomicWrite(resolve(histDir, `${String(now).padStart(15, "0")}.sav`), prev);
      pruneOldest(histDir, SRAM_HISTORY);
    }
    atomicWrite(current, data);
    this.db.query("UPDATE saves SET sram_updated_at = ? WHERE id = ?").run(now, saveId);
    return now;
  }

  // ---------- save states ----------

  listStates(saveId: string): SaveStateInfo[] {
    const rows = this.db
      .query(
        "SELECT slot, created_at, size, has_thumbnail FROM save_states WHERE save_id = ? ORDER BY slot",
      )
      .all(saveId) as { slot: number; created_at: number; size: number; has_thumbnail: number }[];
    return rows.map((r) => ({
      slot: r.slot,
      createdAt: r.created_at,
      size: r.size,
      hasThumbnail: r.has_thumbnail === 1,
    }));
  }

  readState(saveId: string, slot: number): Uint8Array | null {
    const p = this.statePath(saveId, slot);
    return isFile(p) ? readFileSync(p) : null;
  }

  readThumbnail(saveId: string, slot: number): Uint8Array | null {
    const p = this.thumbPath(saveId, slot);
    return isFile(p) ? readFileSync(p) : null;
  }

  writeState(saveId: string, slot: number, data: Uint8Array): SaveStateInfo {
    atomicWrite(this.statePath(saveId, slot), data);
    // A new state invalidates the old thumbnail until the client uploads one.
    rmSync(this.thumbPath(saveId, slot), { force: true });
    const now = this.now();
    this.db
      .query(
        `INSERT INTO save_states (save_id, slot, created_at, size, has_thumbnail) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(save_id, slot) DO UPDATE SET created_at = excluded.created_at, size = excluded.size, has_thumbnail = 0`,
      )
      .run(saveId, slot, now, data.byteLength);
    return { slot, createdAt: now, size: data.byteLength, hasThumbnail: false };
  }

  writeThumbnail(saveId: string, slot: number, png: Uint8Array): boolean {
    const exists = this.db
      .query("SELECT 1 FROM save_states WHERE save_id = ? AND slot = ?")
      .get(saveId, slot);
    if (!exists) return false;
    atomicWrite(this.thumbPath(saveId, slot), png);
    this.db
      .query("UPDATE save_states SET has_thumbnail = 1 WHERE save_id = ? AND slot = ?")
      .run(saveId, slot);
    return true;
  }

  // ---------- checklists ----------

  checklistTemplate(templateId: string): ChecklistTemplate | null {
    if (this.checklistCache.has(templateId)) return this.checklistCache.get(templateId)!;
    let tpl: ChecklistTemplate | null = null;
    // A template in the data dir overrides the built-in one.
    for (const dir of [resolve(this.dataDir, "checklists"), this.builtinChecklistDir]) {
      const p = safeJoin(dir, `${templateId}.json`);
      if (!isFile(p)) continue;
      try {
        tpl = checklistTemplateSchema.parse(JSON.parse(readFileSync(p, "utf8")));
        break;
      } catch (e) {
        console.error(`[checklist] ${p} is invalid:`, e instanceof Error ? e.message : e);
      }
    }
    this.checklistCache.set(templateId, tpl);
    return tpl;
  }

  checklistTemplateFor(gameId: string): ChecklistTemplate | null {
    return this.checklistTemplate(this.templateIdFor(gameId));
  }

  checkedItems(saveId: string): Record<string, number> {
    const rows = this.db
      .query("SELECT item_id, checked_at FROM checklist_progress WHERE save_id = ?")
      .all(saveId) as { item_id: string; checked_at: number }[];
    return Object.fromEntries(rows.map((r) => [r.item_id, r.checked_at]));
  }

  setChecked(saveId: string, itemId: string, checked: boolean): void {
    if (checked) {
      this.db
        .query(
          "INSERT OR IGNORE INTO checklist_progress (save_id, item_id, checked_at) VALUES (?, ?, ?)",
        )
        .run(saveId, itemId, this.now());
    } else {
      this.db
        .query("DELETE FROM checklist_progress WHERE save_id = ? AND item_id = ?")
        .run(saveId, itemId);
    }
  }

  checklistSummary(saveId: string, gameId: string): ChecklistSummary {
    const tpl = this.checklistTemplateFor(gameId);
    if (!tpl) return { done: 0, total: 0, dexDone: 0, dexTotal: 0 };
    const checked = this.checkedItems(saveId);
    let done = 0;
    let dexDone = 0;
    let dexTotal = 0;
    for (const item of tpl.items) {
      const isDex = item.category === "Pokédex";
      const isChecked = item.id in checked;
      if (isDex) dexTotal++;
      if (isChecked) {
        done++;
        if (isDex) dexDone++;
      }
    }
    return { done, total: tpl.items.length, dexDone, dexTotal };
  }

  // ---------- notes / guide marker ----------

  getNotes(saveId: string) {
    const r = this.db.query("SELECT body, updated_at FROM notes WHERE save_id = ?").get(saveId) as {
      body: string;
      updated_at: number;
    } | null;
    return { body: r?.body ?? "", updatedAt: r?.updated_at ?? null };
  }

  setNotes(saveId: string, body: string) {
    const now = this.now();
    this.db
      .query(
        "INSERT INTO notes (save_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(save_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
      )
      .run(saveId, body, now);
    return { body, updatedAt: now };
  }

  getMarker(saveId: string): { sectionId: string | null } {
    const r = this.db
      .query("SELECT section_id FROM guide_markers WHERE save_id = ?")
      .get(saveId) as {
      section_id: string | null;
    } | null;
    return { sectionId: r?.section_id ?? null };
  }

  setMarker(saveId: string, sectionId: string | null) {
    this.db
      .query(
        "INSERT INTO guide_markers (save_id, section_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(save_id) DO UPDATE SET section_id = excluded.section_id, updated_at = excluded.updated_at",
      )
      .run(saveId, sectionId, this.now());
    return { sectionId };
  }

  // ---------- guides ----------

  guideSections(gameId: string): GuideSection[] {
    let dir: string;
    let files: string[];
    try {
      dir = safeJoin(resolve(this.dataDir, "guides"), gameId);
      files = readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".md"))
        .sort();
    } catch {
      return [];
    }
    return files.map((f) => {
      const markdown = readFileSync(safeJoin(dir, f), "utf8");
      const heading = /^#{1,2}\s+(.+)$/m.exec(markdown)?.[1]?.trim();
      const base = f.replace(/\.md$/i, "");
      return {
        id: base
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        title: heading ?? base.replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " "),
        markdown,
      };
    });
  }

  // ---------- settings ----------

  getSettings(): Settings {
    const r = this.db.query("SELECT json FROM settings WHERE id = 1").get() as {
      json: string;
    } | null;
    if (!r) return DEFAULT_SETTINGS;
    const parsed = settingsSchema.partial().safeParse(JSON.parse(r.json));
    if (!parsed.success) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed.data,
      keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...parsed.data.keyBindings },
      padBindings: { ...DEFAULT_SETTINGS.padBindings, ...parsed.data.padBindings },
    };
  }

  setSettings(s: Settings): Settings {
    this.db
      .query(
        "INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
      )
      .run(JSON.stringify(s), this.now());
    return s;
  }
}
