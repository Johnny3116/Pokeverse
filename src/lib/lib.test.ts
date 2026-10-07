import { describe, expect, it } from "vitest";
import { ago, playtime } from "./format";
import { ejsKeyName, prettyKey } from "./keys";
import { NATURES, STATS, typeChart } from "./reference";

describe("keys", () => {
  it("maps KeyboardEvent.code to EmulatorJS names", () => {
    expect(ejsKeyName("KeyX")).toBe("x");
    expect(ejsKeyName("ArrowUp")).toBe("up arrow");
    expect(ejsKeyName("Space")).toBe("space");
    expect(ejsKeyName("Digit7")).toBe("7");
    expect(ejsKeyName("Numpad3")).toBe("numpad 3");
    expect(ejsKeyName("F12")).toBe("f12");
    expect(ejsKeyName("F13")).toBeNull();
    expect(ejsKeyName("MetaLeft")).toBeNull();
  });
  it("prettifies names for display", () => {
    expect(prettyKey("up arrow")).toBe("↑");
    expect(prettyKey("enter")).toBe("Enter");
  });
});

describe("format", () => {
  it("formats playtime", () => {
    expect(playtime(59)).toBe("0m");
    expect(playtime(3 * 3600 + 5 * 60)).toBe("3h 05m");
  });
  it("formats relative time", () => {
    const now = 1_000_000_000_000;
    expect(ago(null, now)).toBe("never");
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 26 * 3600_000, now)).toBe("yesterday");
  });
});

describe("type chart", () => {
  it("applies Gen 3 rules", () => {
    const { types, mult } = typeChart("gen3");
    expect(types).toHaveLength(17);
    expect(types).not.toContain("Fairy");
    expect(mult("Ghost", "Steel")).toBe(0.5);
    expect(mult("Electric", "Ground")).toBe(0);
    expect(mult("Fire", "Grass")).toBe(2);
    expect(mult("Normal", "Normal")).toBe(1);
  });
  it("applies modern rules (Fairy, Steel resistances)", () => {
    const { types, mult } = typeChart("modern");
    expect(types).toHaveLength(18);
    expect(mult("Ghost", "Steel")).toBe(1);
    expect(mult("Dark", "Steel")).toBe(1);
    expect(mult("Dragon", "Fairy")).toBe(0);
    expect(mult("Fairy", "Dragon")).toBe(2);
    expect(mult("Steel", "Fairy")).toBe(2);
    // Gen 3 chart must not be mutated by building the modern one.
    expect(typeChart("gen3").mult("Ghost", "Steel")).toBe(0.5);
  });
});

describe("natures", () => {
  it("has 25 unique natures", () => {
    const all = STATS.flatMap((up) => STATS.map((down) => NATURES[up][down]));
    expect(new Set(all).size).toBe(25);
    expect(NATURES.Spe.SpA).toBe("Jolly");
    expect(NATURES.SpA.Atk).toBe("Modest");
  });
});
