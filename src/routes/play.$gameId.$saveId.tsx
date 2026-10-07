import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useBlocker } from "@tanstack/react-router";
import { PanelRightOpen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Settings, ViewMode } from "@shared/api";
import type { HostInit } from "@shared/emulator-protocol";
import { LockDialog } from "@/components/play/LockDialog";
import { SidePanel, type Tab, TabIcon, TABS } from "@/components/play/SidePanel";
import { Toolbar } from "@/components/play/Toolbar";
import { useEmulatorBridge } from "@/components/play/useEmulatorBridge";
import { useSaveLock } from "@/components/play/useSaveLock";
import { ApiError, api, q } from "@/lib/api";
import { clock } from "@/lib/format";

export const Route = createFileRoute("/play/$gameId/$saveId")({
  loader: async ({ context: { queryClient }, params }) => {
    try {
      let [game] = await Promise.all([
        queryClient.ensureQueryData(q.game(params.gameId)),
        queryClient.ensureQueryData(q.settings()),
      ]);
      // The cache may predate a save created moments ago (or on another device): refetch once.
      if (!game.saves.some((s) => s.id === params.saveId)) {
        game = await queryClient.fetchQuery(q.game(params.gameId));
      }
      // Never fall back to another save: a bad URL must not open (and autosave over) a different one.
      if (!game.saves.some((s) => s.id === params.saveId)) throw notFound();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) throw notFound();
      throw e;
    }
  },
  notFoundComponent: () => (
    <p className="p-10 text-center text-muted-foreground">
      Game or save not found.{" "}
      <Link to="/" className="text-sea">
        Back to library
      </Link>
    </p>
  ),
  component: Play,
});

const GBA_W = 240;
const GBA_H = 160;

function Play() {
  const { gameId, saveId } = Route.useParams();
  const qc = useQueryClient();
  const { data: game } = useQuery(q.game(gameId));
  const { data: settings } = useQuery(q.settings());
  const { data: states = [] } = useQuery(q.states(saveId));
  const save = game?.saves.find((s) => s.id === saveId);

  const [mode, setMode] = useState<ViewMode>(
    settings?.viewMode === "Full" ? "Normal" : (settings?.viewMode ?? "Normal"),
  );
  const [tab, setTab] = useState<Tab>("Guide");
  const [drawer, setDrawer] = useState(false);
  const [slot, setSlot] = useState(1);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(settings?.volume ?? 0.7);
  const [integerScale, setIntegerScale] = useState(settings?.integerScale ?? true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const screenArea = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2);

  const notify = useCallback(
    (text: string, tone: "ok" | "err" = "ok") => setToast({ text, tone }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Persist volume / scaling preferences so they follow you across devices.
  const saveSettings = useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      api.saveSettings({
        ...(qc.getQueryData<Settings>(q.settings().queryKey) ?? settings!),
        ...patch,
      }),
    onSuccess: (s) => qc.setQueryData(q.settings().queryKey, s),
  });

  // ----- lock + emulator bridge -----
  const takePlayed = useRef<() => number>(() => 0);
  const lock = useSaveLock(saveId, () => takePlayed.current());
  const held = lock.state.status === "held";

  const init = useMemo<HostInit | null>(
    () =>
      held && game && settings
        ? {
            gameId,
            saveId,
            clientId: lock.clientId,
            hasBios: game.hasBios,
            volume,
            muted,
            fastForwardRatio: settings.fastForwardRatio,
            fastForwardKey: settings.fastForwardKey,
            keyBindings: settings.keyBindings,
            padBindings: settings.padBindings,
          }
        : null,
    // Boot parameters are read once per emulator instance (frameKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [held, game !== undefined, settings !== undefined, frameKey],
  );

  const bridge = useEmulatorBridge(init, {
    onStateSaved: (n) => {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["states", saveId] });
      notify(`Saved state to slot ${n}`);
    },
    onStateLoaded: (n) => {
      setBusy(false);
      notify(`Loaded slot ${n}`);
    },
    onScreenshot: (png) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([png], { type: "image/png" }));
      a.download = `${gameId}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    onLockLost: () => lock.markLost(),
    onHotkey: () => setDrawer((d) => !d),
    onError: (m) => {
      setBusy(false);
      notify(m, "err");
    },
  });
  takePlayed.current = bridge.takePlayedSec;
  const { post, state: emu } = bridge;

  useEffect(() => {
    if (lock.state.status === "lost") post({ type: "lock-lost" });
  }, [lock.state.status, post]);

  const takeOver = async () => {
    const wasLost = lock.state.status === "lost";
    await lock.acquire(true);
    // After losing the lock, reboot from the server's copy (the other device may have saved).
    if (wasLost) setFrameKey((k) => k + 1);
  };

  // Upload pending SRAM before leaving the page; warn on tab close if a save is pending.
  useBlocker({
    shouldBlockFn: async () => {
      if (emu.started) await bridge.flush();
      return false;
    },
    enableBeforeUnload: () => emu.dirty,
  });

  // ----- view modes -----
  const focusGame = () => {
    post({ type: "focus" });
    bridge.frameRef.current?.focus();
  };
  const changeMode = (m: ViewMode) => {
    setMode(m);
    if (m === "Full") {
      stage.current?.requestFullscreen?.().catch(() => setMode("Normal"));
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    focusGame();
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) {
        setMode((m) => (m === "Full" ? "Normal" : m));
        setDrawer(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && mode === "Full") setDrawer((d) => !d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Integer scaling: size the iframe to a whole multiple of 240x160 that fits.
  useEffect(() => {
    const el = screenArea.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const fit = Math.min(width / GBA_W, height / GBA_H);
      // Below 2x (phones) whole-number scaling would leave a tiny screen; fit instead.
      setScale(integerScale && fit >= 2 ? Math.floor(fit) : fit);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [integerScale, held]);

  if (!game || !save || !settings) return null;
  const theater = mode === "Theater";
  const full = mode === "Full";

  const saveStatus = emu.error
    ? { text: emu.error, cls: "text-primary" }
    : emu.dirty
      ? { text: "Saving…", cls: "text-muted-foreground" }
      : emu.lastSavedAt
        ? { text: `Saved ${clock(emu.lastSavedAt)}`, cls: "text-sea" }
        : save.sramUpdatedAt
          ? { text: "Synced", cls: "text-sea" }
          : { text: "New save", cls: "text-muted-foreground" };

  return (
    <main
      className={`mx-auto px-3 py-4 sm:px-6 sm:py-6 ${theater ? "max-w-none" : "max-w-[1440px]"}`}
    >
      <section
        className={`grid items-start gap-3 ${theater ? "lg:grid-cols-[minmax(0,1fr)_56px]" : "lg:grid-cols-[minmax(0,1fr)_380px]"}`}
      >
        <div
          ref={stage}
          className={`tile relative flex flex-col gap-3 p-3 sm:p-4 ${full ? "!rounded-none !border-0 bg-background" : "lg:h-[calc(100dvh-7rem)]"}`}
        >
          <div className="label-mono flex items-center gap-2">
            <span
              className={`size-1.5 shrink-0 rounded-full ${emu.started && !emu.paused ? "bg-leaf" : "bg-primary"}`}
            />
            <span className="truncate">
              {game.title} · {save.name}
            </span>
            <span className={`ml-auto shrink-0 normal-case tracking-normal ${saveStatus.cls}`}>
              {saveStatus.text}
            </span>
            <span className="hidden shrink-0 sm:inline">
              · {emu.fastForward ? `x${settings.fastForwardRatio}` : "x1"} ·{" "}
              {integerScale ? `${Math.floor(scale)}x` : "fit"}
            </span>
          </div>

          <div
            ref={screenArea}
            className="relative grid aspect-[3/2] min-h-0 w-full place-items-center overflow-hidden rounded-[12px] bg-screen lg:aspect-auto lg:flex-1"
          >
            {held ? (
              <iframe
                key={frameKey}
                ref={bridge.frameRef}
                src="/emulator.html"
                title={`${game.title} emulator`}
                allow="autoplay; gamepad; fullscreen"
                style={{ width: GBA_W * scale, height: GBA_H * scale }}
                className="block border-0 bg-screen"
              />
            ) : (
              <p className="font-mono text-[12px] text-muted-foreground">
                {lock.state.status === "acquiring"
                  ? "Opening save…"
                  : "Save is not open on this device"}
              </p>
            )}
            {held && !game.hasRom && (
              <p className="absolute inset-x-4 bottom-4 rounded-lg bg-primary/15 px-3 py-2 text-center text-[13px] text-primary">
                ROM file missing on NexusBody — check games.json.
              </p>
            )}
          </div>

          <Toolbar
            started={emu.started}
            paused={emu.paused}
            fastForward={emu.fastForward}
            muted={muted}
            volume={volume}
            integerScale={integerScale}
            slot={slot}
            states={states}
            saveId={saveId}
            mode={mode}
            busy={busy}
            onPause={() => {
              post({ type: emu.paused ? "resume" : "pause" });
              focusGame();
            }}
            onFastForward={() => {
              post({ type: "set-fast-forward", on: !emu.fastForward });
              focusGame();
            }}
            onScreenshot={() => {
              post({ type: "screenshot" });
              focusGame();
            }}
            onMute={() => {
              post({ type: "set-volume", volume, muted: !muted });
              setMuted(!muted);
              focusGame();
            }}
            onVolume={(v) => {
              setVolume(v);
              setMuted(false);
              post({ type: "set-volume", volume: v, muted: false });
              saveSettings.mutate({ volume: v });
            }}
            onIntegerScale={() => {
              setIntegerScale(!integerScale);
              saveSettings.mutate({ integerScale: !integerScale });
              focusGame();
            }}
            onSlot={(n) => {
              setSlot(n);
              focusGame();
            }}
            onSaveState={() => {
              setBusy(true);
              post({ type: "save-state", slot });
              focusGame();
            }}
            onLoadState={() => {
              setBusy(true);
              post({ type: "load-state", slot });
              focusGame();
            }}
            onMode={changeMode}
          />

          {full && (
            <>
              <button
                onClick={() => setDrawer(!drawer)}
                className="chip absolute right-4 top-3 z-20 flex items-center gap-1.5 !py-1 text-[11px]"
                title="Side panel (`)"
              >
                <PanelRightOpen className="size-3.5" /> Panel
              </button>
              {drawer && (
                <aside className="tile absolute inset-y-3 right-3 z-30 flex w-[min(380px,90vw)] flex-col !bg-card shadow-2xl">
                  <button
                    onClick={() => setDrawer(false)}
                    className="absolute right-2 top-2 z-10 p-1 text-muted-foreground"
                    aria-label="Close panel"
                  >
                    <X className="size-4" />
                  </button>
                  <SidePanel tab={tab} onTab={setTab} game={game} saveId={saveId} />
                </aside>
              )}
            </>
          )}
        </div>

        {theater ? (
          <aside className="tile flex flex-row items-center justify-center gap-2 py-3 lg:flex-col">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setMode("Normal");
                }}
                title={t}
                aria-label={t}
                className="chip grid size-9 place-items-center !p-0"
              >
                <TabIcon tab={t} className="size-4" />
              </button>
            ))}
          </aside>
        ) : (
          <aside className="tile flex h-[70vh] flex-col lg:h-[calc(100dvh-7rem)]">
            <SidePanel tab={tab} onTab={setTab} game={game} saveId={saveId} />
          </aside>
        )}
      </section>

      <LockDialog
        state={lock.state}
        onTakeOver={() => void takeOver()}
        onRetry={() => void lock.acquire()}
      />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm shadow-lg ${toast.tone === "err" ? "border-primary/40 bg-card text-primary" : "border-sea/40 bg-card text-sea"}`}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
