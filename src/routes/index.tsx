import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { GameSummary } from "@shared/api";
import hero from "@/assets/hero.jpg";
import { BoxArt } from "@/components/BoxArt";
import { SavePicker } from "@/components/SavePicker";
import { q } from "@/lib/api";
import { ago, playtime } from "@/lib/format";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(q.games()),
      context.queryClient.ensureQueryData(q.continue()),
    ]),
  component: Library,
});

function Library() {
  const { data } = useQuery(q.games());
  const { data: cont } = useQuery(q.continue());
  const [picker, setPicker] = useState<GameSummary | null>(null);
  const games = data?.games ?? [];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <section className="tile relative grid !rounded-[22px] lg:grid-cols-[1.35fr_1fr]">
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 sm:p-8">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sea/25 bg-sea/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
            <span className="size-1.5 rounded-full bg-sea" /> {cont ? "Continue" : "Library"}
          </div>
          <div className="max-w-[30ch]">
            <h1 className="text-balance text-4xl font-extrabold leading-[1.03] tracking-tight sm:text-5xl">
              {cont ? `Back to ${cont.game.title}?` : "Keep the save you left glowing."}
            </h1>
            <p className="mt-3 max-w-[42ch] text-pretty text-[15px] leading-relaxed text-muted-foreground">
              {cont
                ? `${cont.save.name} · ${playtime(cont.save.playtimeSec)} played · last played ${ago(cont.save.lastPlayedAt)}`
                : "Your GBA cartridges and saves live on NexusBody. Pick up mid-journey on any device on the tailnet."}
            </p>
          </div>
          {cont && (
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/play/$gameId/$saveId"
                params={{ gameId: cont.game.id, saveId: cont.save.id }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
              >
                Resume {cont.game.title}
              </Link>
              <button
                onClick={() => setPicker(cont.game)}
                className="rounded-full border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-accent"
              >
                Choose save
              </button>
            </div>
          )}
        </div>
        <img
          src={hero}
          alt=""
          width={1200}
          height={800}
          className="h-full max-h-[340px] min-h-[200px] w-full object-cover object-top"
        />
      </section>

      {data?.error && (
        <section className="tile mt-5 border-primary/30 p-5">
          <p className="label-mono text-primary">Library not set up</p>
          <p className="mt-2 text-sm">{data.error}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Copy <code className="font-mono">data.example/library/games.json</code> into your data
            folder and list your ROMs. See the README.
          </p>
        </section>
      )}

      {games.length > 0 && (
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => setPicker(g)}
              className="tile flex flex-col text-left transition-colors hover:border-sea/40 focus-visible:border-sea/60 focus-visible:outline-none"
            >
              <BoxArt game={g} className="aspect-[4/3] w-full" />
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-bold tracking-tight">{g.title}</h3>
                  {!g.hasRom && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                      no ROM
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {g.saveCount === 0
                    ? "No saves yet"
                    : `${playtime(g.playtimeSec)} · ${g.saveCount} save${g.saveCount > 1 ? "s" : ""} · ${ago(g.lastPlayedAt)}`}
                </p>
              </div>
            </button>
          ))}
        </section>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5 font-mono text-[11px] text-muted-foreground">
        <span>
          {games.length} cartridge{games.length === 1 ? "" : "s"}
        </span>
        <span className="text-sea">4 state slots per save</span>
        <span className="ml-auto">POKEVERSE · private · tailnet only</span>
      </footer>

      {picker && <SavePicker game={picker} onClose={() => setPicker(null)} />}
    </main>
  );
}
