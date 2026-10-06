import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS: string[] = [
  `CREATE TABLE saves (
     id TEXT PRIMARY KEY,
     game_id TEXT NOT NULL,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_played_at INTEGER,
     playtime_sec INTEGER NOT NULL DEFAULT 0,
     sram_updated_at INTEGER,
     lock_client TEXT,
     lock_label TEXT,
     lock_expires_at INTEGER
   );
   CREATE INDEX saves_game ON saves(game_id);
   CREATE TABLE save_states (
     save_id TEXT NOT NULL REFERENCES saves(id),
     slot INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     size INTEGER NOT NULL,
     has_thumbnail INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (save_id, slot)
   );
   CREATE TABLE checklist_progress (
     save_id TEXT NOT NULL REFERENCES saves(id),
     item_id TEXT NOT NULL,
     checked_at INTEGER NOT NULL,
     PRIMARY KEY (save_id, item_id)
   );
   CREATE TABLE notes (
     save_id TEXT PRIMARY KEY REFERENCES saves(id),
     body TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE guide_markers (
     save_id TEXT PRIMARY KEY REFERENCES saves(id),
     section_id TEXT,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE settings (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     json TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
];

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true, create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    })();
  }
  return db;
}
