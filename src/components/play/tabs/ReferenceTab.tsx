import { useState } from "react";
import type { Mechanics } from "@shared/api";
import { NATURES, STATS, typeChart } from "@/lib/reference";

const cell = (m: number) =>
  m === 0
    ? "bg-foreground/80 text-background"
    : m > 1
      ? "bg-leaf/70 text-background"
      : m < 1
        ? "bg-primary/60 text-background"
        : "";
const label = (m: number) => (m === 0 ? "0" : m === 0.5 ? "½" : m === 2 ? "2" : "");

export function ReferenceTab({ mechanics }: { mechanics: Mechanics }) {
  const [view, setView] = useState<"types" | "natures">("types");
  const { types, mult } = typeChart(mechanics);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="mb-3 flex gap-1">
        <button
          onClick={() => setView("types")}
          className={`chip !py-1 text-[11px] ${view === "types" ? "chip-sea" : ""}`}
        >
          Type chart
        </button>
        <button
          onClick={() => setView("natures")}
          className={`chip !py-1 text-[11px] ${view === "natures" ? "chip-sea" : ""}`}
        >
          Natures
        </button>
      </div>
      {view === "types" ? (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Rows attack, columns defend ·{" "}
            {mechanics === "modern" ? "Gen 6+ chart (Fairy)" : "Gen 3 chart"}
          </p>
          <table className="border-collapse font-mono text-[9px]">
            <thead>
              <tr>
                <th />
                {types.map((t) => (
                  <th key={t} className="h-12 w-4 align-bottom font-normal text-muted-foreground">
                    <span className="inline-block -rotate-90 whitespace-nowrap">
                      {t.slice(0, 4)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((atk) => (
                <tr key={atk}>
                  <th className="pr-1 text-right font-normal text-muted-foreground">
                    {atk.slice(0, 4)}
                  </th>
                  {types.map((def) => {
                    const m = mult(atk, def);
                    return (
                      <td
                        key={def}
                        title={`${atk} → ${def}: ${m}x`}
                        className={`size-4 border border-border text-center ${cell(m)}`}
                      >
                        {label(m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Rows raise +10%, columns lower −10%
          </p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th />
                {STATS.map((s) => (
                  <th key={s} className="pb-1 font-mono font-normal text-primary">
                    −{s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATS.map((up) => (
                <tr key={up}>
                  <th className="pr-2 text-left font-mono font-normal text-leaf">+{up}</th>
                  {STATS.map((down) => (
                    <td
                      key={down}
                      className={`border border-border px-1 py-1 text-center ${up === down ? "text-muted-foreground" : ""}`}
                    >
                      {NATURES[up][down]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
