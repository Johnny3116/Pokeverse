import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import hero from "@/assets/hero.jpg";
import { games, DEX_TOTAL, type Game } from "@/lib/games";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Library — Sunstone GBA Player" },
      {
        name: "description",
        content: "Your private Pokémon GBA cartridge library. Resume a save in seconds.",
      },
      { property: "og:title", content: "Library — Sunstone GBA Player" },
      {
        property: "og:description",
        content: "Your private Pokémon GBA cartridge library. Resume a save in seconds.",
      },
    ],
  }),
  component: Library,
});

function Library() {
  const current = games[0]!;
  const rest = games.slice(1);
  const firstSave = current.saves[0]!;
  const [picker, setPicker] = useState<Game | null>(null);

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-6">
      {/* Banner */}
      <section className="tile relative grid !rounded-[22px] lg:grid-cols-[1.35fr_1fr]">
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 sm:p-8">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sea/25 bg-sea/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
            <span className="size-1.5 rounded-full bg-sea" /> Hoenn archive
          </div>
          <div className="max-w-[26ch]">
            <h1 className="text-balance text-4xl font-extrabold leading-[1.03] tracking-tight sm:text-5xl">
              Keep the save you left glowing.
            </h1>
            <p className="mt-3 max-w-[42ch] text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Your GBA cartridges, filed by trainer card, badge and route. Pick up mid-journey on
              any device.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/play/$gameId/$saveId"
              params={{ gameId: current.id, saveId: firstSave.id }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Resume {current.title}{" "}
              <span className="font-mono text-[11px] opacity-70">{current.playtime}</span>
            </Link>
            <button
              onClick={() => setPicker(current)}
              className="rounded-full border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Choose save
            </button>
          </div>
        </div>
        <img
          src={hero}
          alt="Misty river delta at golden hour"
          width={1200}
          height={800}
          className="h-full min-h-[240px] w-full object-cover object-top"
        />
      </section>

      {/* Bento grid */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <button
          onClick={() => setPicker(current)}
          className="tile col-span-2 row-span-2 flex flex-col text-left transition-colors hover:border-sea/40"
        >
          <img
            src={current.art}
            alt=""
            width={992}
            height={672}
            className="min-h-[180px] w-full flex-1 object-cover object-top"
          />
          <div className="p-4">
            <div className="label-mono flex items-center justify-between">
              <span>Continue</span>
              <span className="text-sea">{firstSave.id.replace("-", " ")}</span>
            </div>
            <h3 className="mt-1 text-lg font-bold tracking-tight">Pokémon {current.title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {firstSave.location} · {current.badges} badges
            </p>
            <Progress value={current.dex} color="bg-sea" />
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              Dex {current.dex}/{DEX_TOTAL} · {current.playtime}
            </p>
          </div>
        </button>
        {rest.map((g) => (
          <button
            key={g.id}
            onClick={() => setPicker(g)}
            className="tile flex flex-col text-left transition-colors hover:border-sea/40"
          >
            <img
              src={g.art}
              alt=""
              loading="lazy"
              width={944}
              height={704}
              className="aspect-[4/3] w-full object-cover object-top"
            />
            <div className="p-3.5">
              <h3 className="text-[15px] font-bold tracking-tight">{g.title}</h3>
              <p className="font-mono text-[11px] text-muted-foreground">
                {g.playtime} · {g.badges} badges · {g.lastPlayed}
              </p>
              <Progress value={g.dex} color="bg-leaf" />
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                Dex {g.dex}/{DEX_TOTAL}
              </p>
            </div>
          </button>
        ))}
      </section>

      <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5 font-mono text-[11px] text-muted-foreground">
        <span>{games.length} cartridges</span>
        <span className="text-sea">4 state slots</span>
        <span className="ml-auto">SUNSTONE · private · tailnet only</span>
      </footer>

      {picker && <SavePicker game={picker} onClose={() => setPicker(null)} />}
    </main>
  );
}

function Progress({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${(value / DEX_TOTAL) * 100}%` }}
      />
    </div>
  );
}

function SavePicker({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="tile w-full max-w-md !bg-card" onClick={(e) => e.stopPropagation()}>
        <img src={game.art} alt="" className="h-32 w-full object-cover object-top" />
        <div className="p-5">
          <p className="label-mono">Choose a save</p>
          <h2 className="mt-1 text-xl font-bold">Pokémon {game.title}</h2>
          <div className="mt-4 space-y-2">
            {game.saves.map((s) => (
              <Link
                key={s.id}
                to="/play/$gameId/$saveId"
                params={{ gameId: game.id, saveId: s.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5 hover:border-sea/40"
              >
                <span className="size-2 rounded-full bg-sea" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.location}</p>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{s.playtime}</span>
              </Link>
            ))}
            <button className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
              + New save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
