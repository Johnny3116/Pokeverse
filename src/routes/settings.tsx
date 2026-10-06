import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sunstone GBA Player" },
      { name: "description", content: "Key bindings, gamepad, view mode and audio preferences." },
      { property: "og:title", content: "Settings — Sunstone GBA Player" },
      { property: "og:description", content: "Key bindings, gamepad, view mode and audio preferences." },
    ],
  }),
  component: Settings,
});

const keys = [["A", "X"], ["B", "Z"], ["L", "A"], ["R", "S"], ["Start", "Enter"], ["Select", "Backspace"], ["D-Pad", "Arrows"], ["Fast-forward", "Space"]];

function Settings() {
  return (
    <main className="mx-auto max-w-[1440px] px-6 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Saved to your library so they follow you across devices.</p>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <section className="tile p-5">
          <p className="label-mono">Keyboard</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {keys.map(([btn, key]) => (
              <div key={btn} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2">
                <span className="text-[13px]">{btn}</span>
                <kbd className="chip-sea rounded-md border px-2 py-0.5 font-mono text-[11px]">{key}</kbd>
              </div>
            ))}
          </div>
        </section>
        <section className="tile space-y-5 p-5">
          <div>
            <p className="label-mono">Default view</p>
            <div className="mt-2 flex gap-1">
              {["Normal", "Theater", "Full"].map((m, i) => (
                <button key={m} className={`chip ${i === 0 ? "chip-primary" : ""}`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label-mono">Volume</p>
            <input type="range" defaultValue={70} className="mt-2 w-full accent-sea" />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">Integer scaling</span>
            <input type="checkbox" defaultChecked className="size-4 accent-sea" />
          </label>
          <div>
            <p className="label-mono">Gamepad</p>
            <p className="mt-2 text-[13px] text-muted-foreground">Press any button on a controller to start remapping.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
