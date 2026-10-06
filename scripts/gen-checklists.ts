// Generates the built-in checklist templates in checklists/.
//
//   bun scripts/gen-checklists.ts <path/to/pokemon_species_names.csv>
//
// Pokédex names come from PokéAPI's CSV data (BSD-3-Clause,
// https://github.com/PokeAPI/pokeapi). Gyms, Elite Four, legendaries and HMs are
// hand-written below. The output is committed, so builds never need the network.
// A template in <DATA_DIR>/checklists/<id>.json overrides the built-in one.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checklistTemplateSchema,
  type ChecklistItem,
  type ChecklistTemplate,
} from "../shared/api.ts";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: bun scripts/gen-checklists.ts <pokemon_species_names.csv>");
  process.exit(1);
}

const ENGLISH = "9";
const names = new Map<number, string>();
for (const line of readFileSync(csvPath, "utf8").split("\n").slice(1)) {
  const [id, lang, name] = line.split(",");
  if (lang === ENGLISH && id && name) names.set(Number(id), name);
}
const dex: ChecklistItem[] = Array.from({ length: 386 }, (_, i) => {
  const n = i + 1;
  const name = names.get(n);
  if (!name) throw new Error(`missing species ${n}`);
  return {
    id: `dex-${String(n).padStart(3, "0")}`,
    name: `#${String(n).padStart(3, "0")} ${name}`,
    category: "Pokédex",
  };
});

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type Gym = [leader: string, badge: string, city: string];
const badges = (gyms: Gym[]): ChecklistItem[] =>
  gyms.map(([leader, badge, city], i) => ({
    id: `badge-${slug(badge)}`,
    name: `${badge} Badge`,
    category: "Badges",
    location: city,
    note: `Gym ${i + 1} · ${leader}`,
  }));
const league = (members: string[], champion: string): ChecklistItem[] => [
  ...members.map((m) => ({
    id: `e4-${slug(m)}`,
    name: m,
    category: "Elite Four",
    location: "Pokémon League",
  })),
  {
    id: `champion-${slug(champion)}`,
    name: `Champion ${champion}`,
    category: "Elite Four",
    location: "Pokémon League",
  },
];
const legends = (list: [name: string, where: string, note?: string][]): ChecklistItem[] =>
  list.map(([name, location, note]) => ({
    id: `legend-${slug(name)}`,
    name,
    category: "Legendaries",
    location,
    ...(note ? { note } : {}),
  }));
const hms = (list: string[]): ChecklistItem[] =>
  list.map((move, i) => ({
    id: `hm-${String(i + 1).padStart(2, "0")}`,
    name: `HM0${i + 1} ${move}`,
    category: "HMs",
  }));

const HOENN_GYMS = (eighth: string): Gym[] => [
  ["Roxanne", "Stone", "Rustboro City"],
  ["Brawly", "Knuckle", "Dewford Town"],
  ["Wattson", "Dynamo", "Mauville City"],
  ["Flannery", "Heat", "Lavaridge Town"],
  ["Norman", "Balance", "Petalburg City"],
  ["Winona", "Feather", "Fortree City"],
  ["Tate & Liza", "Mind", "Mossdeep City"],
  [eighth, "Rain", "Sootopolis City"],
];
const HOENN_E4 = ["Sidney", "Phoebe", "Glacia", "Drake"];
const HOENN_HMS = ["Cut", "Fly", "Surf", "Strength", "Flash", "Rock Smash", "Waterfall", "Dive"];
const REGIS: [string, string][] = [
  ["Regirock", "Desert Ruins"],
  ["Regice", "Island Cave"],
  ["Registeel", "Ancient Tomb"],
];

const KANTO_GYMS: Gym[] = [
  ["Brock", "Boulder", "Pewter City"],
  ["Misty", "Cascade", "Cerulean City"],
  ["Lt. Surge", "Thunder", "Vermilion City"],
  ["Erika", "Rainbow", "Celadon City"],
  ["Koga", "Soul", "Fuchsia City"],
  ["Sabrina", "Marsh", "Saffron City"],
  ["Blaine", "Volcano", "Cinnabar Island"],
  ["Giovanni", "Earth", "Viridian City"],
];
const KANTO_E4 = ["Lorelei", "Bruno", "Agatha", "Lance"];
const KANTO_HMS = ["Cut", "Fly", "Surf", "Strength", "Flash", "Rock Smash", "Waterfall"];
const KANTO_LEGENDS = legends([
  ["Articuno", "Seafoam Islands"],
  ["Zapdos", "Power Plant"],
  ["Moltres", "Mt. Ember"],
  ["Mewtwo", "Cerulean Cave", "Post-game"],
  ["Roaming beast", "Kanto (roaming)", "Raikou, Entei or Suicune depending on your starter"],
]);

const DEX_SOURCE = "Pokédex names from PokéAPI (BSD-3-Clause).";

const templates: ChecklistTemplate[] = [
  {
    gameId: "ruby",
    title: "Pokémon Ruby",
    source: DEX_SOURCE,
    categories: ["Badges", "Elite Four", "Legendaries", "HMs", "Pokédex"],
    items: [
      ...badges(HOENN_GYMS("Wallace")),
      ...league(HOENN_E4, "Steven"),
      ...legends([
        ["Groudon", "Cave of Origin"],
        ["Rayquaza", "Sky Pillar"],
        ...REGIS,
        ["Latios", "Hoenn (roaming)", "Post-game"],
      ]),
      ...hms(HOENN_HMS),
      ...dex,
    ],
  },
  {
    gameId: "sapphire",
    title: "Pokémon Sapphire",
    source: DEX_SOURCE,
    categories: ["Badges", "Elite Four", "Legendaries", "HMs", "Pokédex"],
    items: [
      ...badges(HOENN_GYMS("Wallace")),
      ...league(HOENN_E4, "Steven"),
      ...legends([
        ["Kyogre", "Cave of Origin"],
        ["Rayquaza", "Sky Pillar"],
        ...REGIS,
        ["Latias", "Hoenn (roaming)", "Post-game"],
      ]),
      ...hms(HOENN_HMS),
      ...dex,
    ],
  },
  {
    gameId: "emerald",
    title: "Pokémon Emerald",
    source: DEX_SOURCE,
    categories: ["Badges", "Elite Four", "Legendaries", "HMs", "Pokédex"],
    items: [
      ...badges(HOENN_GYMS("Juan")),
      ...league(HOENN_E4, "Wallace"),
      ...legends([
        ["Rayquaza", "Sky Pillar"],
        ["Kyogre", "Marine Cave", "Post-game"],
        ["Groudon", "Terra Cave", "Post-game"],
        ...REGIS,
        ["Roaming Eon", "Hoenn (roaming)", "Latias or Latios, your choice after the League"],
      ]),
      ...hms(HOENN_HMS),
      ...dex,
    ],
  },
  {
    gameId: "firered",
    title: "Pokémon FireRed",
    source: DEX_SOURCE,
    categories: ["Badges", "Elite Four", "Legendaries", "HMs", "Pokédex"],
    items: [
      ...badges(KANTO_GYMS),
      ...league(KANTO_E4, "(Rival)"),
      ...KANTO_LEGENDS,
      ...hms(KANTO_HMS),
      ...dex,
    ],
  },
  {
    gameId: "leafgreen",
    title: "Pokémon LeafGreen",
    source: DEX_SOURCE,
    categories: ["Badges", "Elite Four", "Legendaries", "HMs", "Pokédex"],
    items: [
      ...badges(KANTO_GYMS),
      ...league(KANTO_E4, "(Rival)"),
      ...KANTO_LEGENDS,
      ...hms(KANTO_HMS),
      ...dex,
    ],
  },
  // ROM hacks: progression only. Their rosters span later generations and differ from
  // vanilla, so there is no Pokédex here; drop a full template into
  // <DATA_DIR>/checklists/ to replace these.
  {
    gameId: "emerald-imperium",
    title: "Emerald Imperium",
    source:
      "Progression only (based on Emerald). Replace via data/checklists/emerald-imperium.json.",
    categories: ["Badges", "Elite Four"],
    items: [...badges(HOENN_GYMS("Juan")), ...league(HOENN_E4, "Wallace")],
  },
  {
    gameId: "radical-red",
    title: "Radical Red",
    source: "Progression only (based on FireRed). Replace via data/checklists/radical-red.json.",
    categories: ["Badges", "Elite Four"],
    items: [...badges(KANTO_GYMS), ...league(KANTO_E4, "(Rival)")],
  },
];

const outDir = resolve(import.meta.dirname, "../checklists");
mkdirSync(outDir, { recursive: true });
for (const t of templates) {
  const parsed = checklistTemplateSchema.parse(t);
  const ids = new Set(parsed.items.map((i) => i.id));
  if (ids.size !== parsed.items.length) throw new Error(`duplicate item ids in ${t.gameId}`);
  writeFileSync(resolve(outDir, `${t.gameId}.json`), JSON.stringify(parsed, null, 2) + "\n");
  console.log(`${t.gameId}: ${parsed.items.length} items`);
}
