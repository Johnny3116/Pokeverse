import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import screen from "@/assets/screen.jpg";
import { getGame, NUZLOCKE_TRACKER_URL } from "@/lib/games";

export const Route = createFileRoute("/play/$gameId/$saveId")({
  loader: ({ params }) => {
    const game = getGame(params.gameId);
    if (!game) throw notFound();
    const save = game.saves.find((s) => s.id === params.saveId) ?? game.saves[0]!;
    return { game, save };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `Playing ${loaderData.game.title} — Sunstone` : "Not found";
    return { meta: [
      { title: t },
      { name: "description", content: "Play with guide, checklist and notes side by side." },
      { property: "og:title", content: t },
      { property: "og:description", content: "Play with guide, checklist and notes side by side." },
    ] };
  },
  notFoundComponent: () => <p className="p-10 text-center text-muted-foreground">Game not found. <Link to="/" className="text-sea">Back to library</Link></p>,
  component: Play,
});

type Mode = "Normal" | "Theater" | "Full";
type Tab = "Guide" | "Nuzlocke" | "Checklist" | "Notes";
const TABS: Tab[] = ["Guide", "Nuzlocke", "Checklist", "Notes"];

const checklist = [
  { cat: "Badge", name: "Stone", done: true },
  { cat: "Badge", name: "Knuckle", done: true },
  { cat: "Badge", name: "Dynamo", done: true },
  { cat: "Badge", name: "Heat", done: false },
  { cat: "Legendary", name: "Rayquaza", done: false },
  { cat: "Legendary", name: "Regirock", done: false },
];

function Play() {
  const { game, save } = Route.useLoaderData();
  const [mode, setMode] = useState<Mode>("Normal");
  const [tab, setTab] = useState<Tab>("Guide");
  const [slot, setSlot] = useState(3);
  const [ff, setFf] = useState(false);
  const [muted, setMuted] = useState(false);
  const [items, setItems] = useState(checklist);
  const [notes, setNotes] = useState("Team plan: Marshtomp, Swellow, Gardevoir…");
  const stage = useRef<HTMLDivElement>(null);

  const changeMode = (m: Mode) => {
    setMode(m);
    if (m === "Full") stage.current?.requestFullscreen?.().catch(() => {});
  };
  const openTracker = () => {
    const w = 520;
    window.open(NUZLOCKE_TRACKER_URL, "nuzlocke-tracker", `popup,width=${w},height=${window.outerHeight},left=${window.screenX + window.outerWidth - w},top=${window.screenY}`);
  };
  const theater = mode === "Theater";

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-6">
      <section className={`grid items-start gap-3 ${theater ? "lg:grid-cols-[minmax(0,1fr)_56px]" : "lg:grid-cols-[minmax(0,1fr)_360px]"}`}>
        <div ref={stage} className="tile relative p-4">
          <div className="label-mono flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" /> Play · {game.title} · {save.name}
            <span className="ml-auto">{ff ? "x2.0" : "x1.0"} · 3x · integer</span>
          </div>
          <div className="relative mx-auto mt-3 aspect-[3/2] w-full overflow-hidden rounded-[12px] bg-screen">
            <img src={screen} alt="Emulator screen" className="pixelated absolute inset-0 h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-sweep bg-gradient-to-b from-foreground/5 to-transparent" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button className="chip" title="Pause">⏸</button>
            <button className={`chip ${ff ? "chip-sea" : ""}`} onClick={() => setFf(!ff)} title="Fast-forward">⏩</button>
            <button className="chip" title="Screenshot">📷</button>
            <button className="chip" onClick={() => setMuted(!muted)} title="Mute">{muted ? "🔇" : "🔊"}</button>
            <div className="mx-1 flex items-center gap-1">
              <span className="label-mono">State</span>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setSlot(n)} className={`chip font-mono !px-2 !py-1 text-[11px] ${slot === n ? "chip-sea" : ""}`}>{n}</button>
              ))}
              <button className="chip !py-1">Save</button>
              <button className="chip !py-1">Load</button>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {(["Normal", "Theater", "Full"] as Mode[]).map((m) => (
                <button key={m} onClick={() => changeMode(m)} className={`chip !py-1 ${mode === m ? "chip-primary" : ""}`}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        {theater ? (
          <aside className="tile flex flex-col items-center gap-2 py-3">
            {TABS.map((t) => (
              <button key={t} onClick={() => { setTab(t); setMode("Normal"); }} title={t}
                className="chip grid size-9 place-items-center !p-0 font-mono text-[11px]">{t[0]}</button>
            ))}
          </aside>
        ) : (
          <aside className="tile flex flex-col lg:h-[calc(100vh-7rem)]">
            <div className="flex border-b border-border font-mono text-[11px] uppercase tracking-[0.12em]">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 border-b-2 px-2 py-2.5 ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{t}</button>
              ))}
            </div>
            <div className={`flex min-h-0 flex-1 flex-col ${tab === "Guide" && game.guideUrl ? "" : "p-4"}`}>
              {tab === "Guide" && game.guideUrl && (
                <>
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <span className="label-mono">{game.title} walkthrough</span>
                    <a href={game.guideUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-sea hover:underline">Open ↗</a>
                  </div>
                  <iframe src={game.guideUrl} title={`${game.title} walkthrough`} className="min-h-[480px] w-full flex-1 bg-background" />
                </>
              )}
              {tab === "Guide" && !game.guideUrl && (
                <>
                  <p className="label-mono">{save.location} · <span className="text-primary">you are here</span></p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    No walkthrough linked for {game.title} yet.
                  </p>
                </>
              )}
              {tab === "Nuzlocke" && (
                <div className="space-y-3">
                  <p className="label-mono">Nuzlocke tracker</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Nuzlocke Tracker can't be shown inside this panel (the site blocks it), so it opens in its own window next to the game.
                  </p>
                  <button onClick={openTracker} className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/85">
                    Open tracker window
                  </button>
                  <a href={NUZLOCKE_TRACKER_URL} target="_blank" rel="noreferrer" className="block text-center font-mono text-[11px] text-sea hover:underline">or open in a new tab ↗</a>
                </div>
              )}
              {tab === "Checklist" && (
                <div className="space-y-2">
                  <input placeholder="Search…" className="mb-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:border-sea/50" />
                  {items.map((it, i) => (
                    <button key={it.name} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-secondary px-3 py-2 text-left">
                      <span className={`size-2 rounded-full ${it.done ? "bg-leaf" : "bg-muted-foreground/40"}`} />
                      <span className={`text-[13px] ${it.done ? "" : "text-muted-foreground"}`}>{it.cat} · {it.name}</span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{it.done ? "✓" : "—"}</span>
                    </button>
                  ))}
                </div>
              )}
              {tab === "Notes" && (
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="h-64 w-full resize-none rounded-lg border border-border bg-secondary p-3 text-[13px] outline-none focus:border-sea/50" />
              )}
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}
