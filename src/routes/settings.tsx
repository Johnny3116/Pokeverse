import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  GBA_BUTTONS,
  type GbaButton,
  type Settings,
  VIEW_MODES,
} from "@shared/api";
import { api, q } from "@/lib/api";
import { ejsKeyName, PAD_LABELS, prettyKey, prettyPad } from "@/lib/keys";

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q.settings()),
  component: SettingsPage,
});

type Capture = { kind: "key" | "pad"; button: GbaButton | "fastForward" } | null;

function SettingsPage() {
  const { data } = useQuery(q.settings());
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [capture, setCapture] = useState<Capture>(null);
  const s = draft ?? data ?? DEFAULT_SETTINGS;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(data);
  const save = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (next) => {
      qc.setQueryData(q.settings().queryKey, next);
      setDraft(null);
    },
  });
  const update = (patch: Partial<Settings>) => setDraft({ ...s, ...patch });

  // Keyboard capture.
  useEffect(() => {
    if (capture?.kind !== "key") return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") return setCapture(null);
      const name = ejsKeyName(e.code);
      if (!name) return;
      if (capture.button === "fastForward") update({ fastForwardKey: name });
      else update({ keyBindings: { ...s.keyBindings, [capture.button]: name } });
      setCapture(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  // Gamepad capture: poll for the first newly pressed button.
  useEffect(() => {
    if (capture?.kind !== "pad" || capture.button === "fastForward") return;
    const button = capture.button;
    const held = new Set<string>();
    let first = true;
    const id = setInterval(() => {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue;
        pad.buttons.forEach((b, i) => {
          const key = `${pad.index}:${i}`;
          if (b.pressed && !held.has(key) && !first && PAD_LABELS[i]) {
            update({ padBindings: { ...s.padBindings, [button]: PAD_LABELS[i] } });
            setCapture(null);
          }
          if (b.pressed) held.add(key);
          else held.delete(key);
        });
      }
      first = false;
    }, 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCapture(null);
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  const isCapturing = (kind: "key" | "pad", button: GbaButton | "fastForward") =>
    capture?.kind === kind && capture.button === button;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stored on NexusBody, so they follow you across devices.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {dirty && (
            <button
              onClick={() => setDraft(null)}
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm hover:bg-accent"
            >
              Discard
            </button>
          )}
          <button
            onClick={() => draft && save.mutate(draft)}
            disabled={!dirty || save.isPending}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
          >
            {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
      {save.error && <p className="mt-2 text-sm text-primary">{save.error.message}</p>}

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <section className="tile p-5">
          <p className="label-mono">Controls</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Click a binding, then press a key or controller button. Esc cancels.
          </p>
          <div className="mt-3 grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1.5 text-[13px]">
            <span />
            <span className="label-mono">Keyboard</span>
            <span className="label-mono">Gamepad</span>
            {GBA_BUTTONS.map((b) => (
              <Row key={b} label={b}>
                <BindButton
                  active={isCapturing("key", b)}
                  onClick={() => setCapture({ kind: "key", button: b })}
                >
                  {prettyKey(s.keyBindings[b] ?? "")}
                </BindButton>
                <BindButton
                  active={isCapturing("pad", b)}
                  onClick={() => setCapture({ kind: "pad", button: b })}
                >
                  {prettyPad(s.padBindings[b] ?? "")}
                </BindButton>
              </Row>
            ))}
            <Row label="Fast-forward">
              <BindButton
                active={isCapturing("key", "fastForward")}
                onClick={() => setCapture({ kind: "key", button: "fastForward" })}
              >
                {prettyKey(s.fastForwardKey)}
              </BindButton>
              <span className="text-[11px] text-muted-foreground">toggle</span>
            </Row>
          </div>
          <button
            onClick={() =>
              update({
                keyBindings: DEFAULT_SETTINGS.keyBindings,
                padBindings: DEFAULT_SETTINGS.padBindings,
                fastForwardKey: DEFAULT_SETTINGS.fastForwardKey,
              })
            }
            className="mt-4 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Reset controls to defaults
          </button>
        </section>

        <section className="tile space-y-5 p-5">
          <div>
            <p className="label-mono">Default view</p>
            <div className="mt-2 flex gap-1">
              {VIEW_MODES.filter((m) => m !== "Full").map((m) => (
                <button
                  key={m}
                  onClick={() => update({ viewMode: m })}
                  className={`chip ${s.viewMode === m ? "chip-primary" : ""}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-mono flex justify-between" htmlFor="vol">
              <span>Volume</span>
              <span>{Math.round(s.volume * 100)}%</span>
            </label>
            <input
              id="vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="mt-2 w-full accent-sea"
            />
          </div>
          <div>
            <label className="label-mono flex justify-between" htmlFor="ff">
              <span>Fast-forward speed</span>
              <span>x{s.fastForwardRatio}</span>
            </label>
            <input
              id="ff"
              type="range"
              min={1.5}
              max={8}
              step={0.5}
              value={s.fastForwardRatio}
              onChange={(e) => update({ fastForwardRatio: Number(e.target.value) })}
              className="mt-2 w-full accent-sea"
            />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm">Integer scaling (crisp pixels)</span>
            <input
              type="checkbox"
              checked={s.integerScale}
              onChange={(e) => update({ integerScale: e.target.checked })}
              className="size-4 accent-sea"
            />
          </label>
          <p className="text-[12px] text-muted-foreground">
            Touch controls appear automatically on phones and tablets. Gamepads work in any browser
            that supports the Gamepad API.
          </p>
        </section>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pr-2 text-muted-foreground">{label}</span>
      {children}
    </>
  );
}

function BindButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-left font-mono text-[11px] ${active ? "animate-pulse border-primary bg-primary/15 text-primary" : "chip-sea"}`}
    >
      {active ? "Press…" : children || "—"}
    </button>
  );
}
