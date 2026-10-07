import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { idSchema } from "../shared/api.ts";
import { isFile, safeJoin } from "./files.ts";

const fileName = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !/[\\/]/.test(s) && s !== "." && s !== "..", "must be a plain file name");

const gameEntrySchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(80),
  region: z.string().max(40).default(""),
  /** ROM file name inside <library>/roms/. */
  rom: fileName.refine((s) => /\.(gba|zip|7z)$/i.test(s), "ROM must be .gba, .zip or .7z"),
  /** Box art file name inside <library>/boxart/. Optional. */
  boxArt: fileName
    .refine((s) => /\.(png|jpe?g|webp|avif)$/i.test(s), "box art must be an image")
    .optional(),
  /** External walkthrough shown when there is no Markdown guide. */
  guideUrl: z.string().url().startsWith("https://").optional(),
  /** "modern" for hacks that use the Gen 6+ type chart (Fairy). */
  mechanics: z.enum(["gen3", "modern"]).default("gen3"),
  /** Checklist template id; defaults to the game id. */
  checklist: idSchema.optional(),
});

const manifestSchema = z.object({
  games: z.array(gameEntrySchema).superRefine((games, ctx) => {
    const seen = new Set<string>();
    for (const g of games) {
      if (seen.has(g.id)) ctx.addIssue({ code: "custom", message: `duplicate game id ${g.id}` });
      seen.add(g.id);
    }
  }),
});

export type GameEntry = z.infer<typeof gameEntrySchema>;

export type Library = {
  games: GameEntry[];
  error: string | null;
  get(id: string): GameEntry | undefined;
  romPath(game: GameEntry): string | null;
  boxArtPath(game: GameEntry): string | null;
  biosPath(): string | null;
};

const BIOS_NAMES = ["gba_bios.bin", "gba.bin", "bios.bin"];

export function loadLibrary(libraryDir: string): Library {
  const manifestPath = resolve(libraryDir, "games.json");
  let games: GameEntry[] = [];
  let error: string | null = null;
  try {
    games = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8"))).games;
  } catch (e) {
    error =
      e instanceof z.ZodError
        ? `games.json is invalid: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : (e as NodeJS.ErrnoException).code === "ENOENT"
          ? `No games.json found at ${manifestPath}`
          : `Could not read games.json: ${(e as Error).message}`;
    console.error(`[library] ${error}`);
  }
  const byId = new Map(games.map((g) => [g.id, g]));
  const existing = (dir: string, name: string | undefined) => {
    if (!name) return null;
    const p = safeJoin(resolve(libraryDir, dir), name);
    return isFile(p) ? p : null;
  };
  return {
    games,
    error,
    get: (id) => byId.get(id),
    romPath: (g) => existing("roms", g.rom),
    boxArtPath: (g) => existing("boxart", g.boxArt),
    biosPath: () => {
      const dir = resolve(libraryDir, "bios");
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        return null;
      }
      const name = BIOS_NAMES.find((n) => names.includes(n));
      return name ? existing("bios", name) : null;
    },
  };
}
