import type { Mechanics } from "@shared/api";

export const GEN3_TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
] as const;

type Chart = Record<string, Record<string, number>>;

// Attacker -> defender multipliers that differ from 1x (Gen 3 rules).
const GEN3: Chart = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: {
    Fire: 0.5,
    Water: 2,
    Grass: 0.5,
    Poison: 0.5,
    Ground: 2,
    Flying: 0.5,
    Bug: 0.5,
    Rock: 2,
    Dragon: 0.5,
    Steel: 0.5,
  },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: {
    Normal: 2,
    Ice: 2,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 0.5,
    Bug: 0.5,
    Rock: 2,
    Ghost: 0,
    Dark: 2,
    Steel: 2,
  },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: {
    Fire: 0.5,
    Grass: 2,
    Fighting: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 2,
    Ghost: 0.5,
    Dark: 2,
    Steel: 0.5,
  },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5, Steel: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Steel: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5 },
};

/** Gen 6+ chart: adds Fairy, and Steel no longer resists Ghost or Dark. */
function modernChart(): Chart {
  const c: Chart = Object.fromEntries(Object.entries(GEN3).map(([k, v]) => [k, { ...v }]));
  delete c.Ghost!.Steel;
  delete c.Dark!.Steel;
  c.Fairy = { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 };
  c.Fighting!.Fairy = 0.5;
  c.Bug!.Fairy = 0.5;
  c.Dark!.Fairy = 0.5;
  c.Dragon!.Fairy = 0;
  c.Poison!.Fairy = 2;
  c.Steel!.Fairy = 2;
  return c;
}

export function typeChart(mechanics: Mechanics) {
  const types: string[] = mechanics === "modern" ? [...GEN3_TYPES, "Fairy"] : [...GEN3_TYPES];
  const chart = mechanics === "modern" ? modernChart() : GEN3;
  return { types, mult: (atk: string, def: string) => chart[atk]?.[def] ?? 1 };
}

export const STATS = ["Atk", "Def", "SpA", "SpD", "Spe"] as const;

/** Natures by [raised stat][lowered stat]; the diagonal is neutral. */
export const NATURES: Record<(typeof STATS)[number], Record<(typeof STATS)[number], string>> = {
  Atk: { Atk: "Hardy", Def: "Lonely", SpA: "Adamant", SpD: "Naughty", Spe: "Brave" },
  Def: { Atk: "Bold", Def: "Docile", SpA: "Impish", SpD: "Lax", Spe: "Relaxed" },
  SpA: { Atk: "Modest", Def: "Mild", SpA: "Bashful", SpD: "Rash", Spe: "Quiet" },
  SpD: { Atk: "Calm", Def: "Gentle", SpA: "Careful", SpD: "Quirky", Spe: "Sassy" },
  Spe: { Atk: "Timid", Def: "Hasty", SpA: "Jolly", SpD: "Naive", Spe: "Serious" },
};
