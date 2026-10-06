// API contract shared by the Bun server and the React client.
import { z } from "zod";

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const idSchema = z.string().regex(ID_PATTERN, "invalid id");

export const STATE_SLOTS = [1, 2, 3, 4] as const;
export const slotSchema = z.coerce.number().int().min(1).max(STATE_SLOTS.length);

/** Lock lease: the holder renews every LOCK_HEARTBEAT_MS; it expires after LOCK_TTL_MS. */
export const LOCK_TTL_MS = 60_000;
export const LOCK_HEARTBEAT_MS = 15_000;

export const MAX_SRAM_BYTES = 512 * 1024;
export const MAX_STATE_BYTES = 8 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1024 * 1024;

// ---------- Library ----------

export type ChecklistSummary = { done: number; total: number; dexDone: number; dexTotal: number };

/** Type chart era: vanilla Gen 3, or modern (Fairy type, Gen 6+ chart) used by many ROM hacks. */
export type Mechanics = "gen3" | "modern";

export type GameSummary = {
  id: string;
  title: string;
  region: string;
  mechanics: Mechanics;
  hasRom: boolean;
  hasBoxArt: boolean;
  guideUrl: string | null;
  hasMarkdownGuide: boolean;
  saveCount: number;
  playtimeSec: number;
  lastPlayedAt: number | null;
};

export type SaveFile = {
  id: string;
  gameId: string;
  name: string;
  createdAt: number;
  lastPlayedAt: number | null;
  playtimeSec: number;
  hasSram: boolean;
  sramUpdatedAt: number | null;
  location: string | null;
  checklist: ChecklistSummary;
};

export type GameDetail = GameSummary & { saves: SaveFile[]; hasBios: boolean };

export type ContinueInfo = { game: GameSummary; save: SaveFile } | null;

export const createSaveSchema = z.object({ name: z.string().trim().min(1).max(60) });
export const renameSaveSchema = createSaveSchema;

// ---------- Locks ----------

export const lockRequestSchema = z.object({
  clientId: z.string().uuid(),
  label: z.string().trim().max(80).default("Unknown device"),
  takeover: z.boolean().default(false),
  /** Seconds of active play since the last heartbeat; added to playtime (capped server-side). */
  playedSec: z.number().int().min(0).max(600).default(0),
});
export type LockRequest = z.input<typeof lockRequestSchema>;

export type LockInfo = { clientId: string; label: string; expiresAt: number };
export type LockConflict = { error: "locked"; heldBy: LockInfo };

export const unlockSchema = z.object({ clientId: z.string().uuid() });

// ---------- Save states ----------

export type SaveStateInfo = {
  slot: number;
  createdAt: number;
  size: number;
  hasThumbnail: boolean;
};

// ---------- Checklists ----------

export const checklistItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-:]{0,79}$/),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(40),
  location: z.string().max(120).optional(),
  note: z.string().max(200).optional(),
});
export const checklistTemplateSchema = z.object({
  gameId: idSchema,
  title: z.string(),
  source: z.string().optional(),
  categories: z.array(z.string()).min(1),
  items: z.array(checklistItemSchema),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export type ChecklistResponse = {
  template: ChecklistTemplate;
  checked: Record<string, number>; // itemId -> checkedAt
};

export const checklistPatchSchema = z.object({
  itemId: checklistItemSchema.shape.id,
  checked: z.boolean(),
});

// ---------- Notes / guide marker ----------

export const notesSchema = z.object({ body: z.string().max(100_000) });
export type Notes = { body: string; updatedAt: number | null };

export const markerSchema = z.object({ sectionId: z.string().max(200).nullable() });
export type GuideMarker = { sectionId: string | null };

// ---------- Guides ----------

export type GuideSection = { id: string; title: string; markdown: string };
export type GuideResponse = { sections: GuideSection[] };

// ---------- Settings ----------

export const GBA_BUTTONS = [
  "A",
  "B",
  "L",
  "R",
  "Start",
  "Select",
  "Up",
  "Down",
  "Left",
  "Right",
] as const;
export type GbaButton = (typeof GBA_BUTTONS)[number];

export const VIEW_MODES = ["Normal", "Theater", "Full"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

const keyName = z.string().min(1).max(32);

export const settingsSchema = z.object({
  keyBindings: z.record(z.enum(GBA_BUTTONS), keyName),
  padBindings: z.record(z.enum(GBA_BUTTONS), keyName),
  fastForwardKey: keyName,
  viewMode: z.enum(VIEW_MODES),
  volume: z.number().min(0).max(1),
  integerScale: z.boolean(),
  fastForwardRatio: z.number().min(1.5).max(8),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  keyBindings: {
    A: "x",
    B: "z",
    L: "a",
    R: "s",
    Start: "enter",
    Select: "backspace",
    Up: "up arrow",
    Down: "down arrow",
    Left: "left arrow",
    Right: "right arrow",
  },
  padBindings: {
    A: "BUTTON_2",
    B: "BUTTON_1",
    L: "LEFT_TOP_SHOULDER",
    R: "RIGHT_TOP_SHOULDER",
    Start: "START",
    Select: "SELECT",
    Up: "DPAD_UP",
    Down: "DPAD_DOWN",
    Left: "DPAD_LEFT",
    Right: "DPAD_RIGHT",
  },
  fastForwardKey: "space",
  viewMode: "Normal",
  volume: 0.7,
  integerScale: true,
  fastForwardRatio: 3,
};

export type ApiError = { error: string; details?: unknown };
