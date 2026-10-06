import { Link } from "@tanstack/react-router";
import {
  Camera,
  FastForward,
  Gamepad2,
  Maximize,
  Pause,
  Play,
  Rows3,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ReactNode } from "react";
import { type SaveStateInfo, STATE_SLOTS, type ViewMode } from "@shared/api";
import { ago } from "@/lib/format";

type Props = {
  started: boolean;
  paused: boolean;
  fastForward: boolean;
  muted: boolean;
  volume: number;
  integerScale: boolean;
  slot: number;
  states: SaveStateInfo[];
  saveId: string;
  mode: ViewMode;
  busy: boolean;
  onPause: () => void;
  onFastForward: () => void;
  onScreenshot: () => void;
  onMute: () => void;
  onVolume: (v: number) => void;
  onIntegerScale: () => void;
  onSlot: (n: number) => void;
  onSaveState: () => void;
  onLoadState: () => void;
  onMode: (m: ViewMode) => void;
};

const Btn = ({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    title={title}
    aria-label={title}
    aria-pressed={active}
    onClick={onClick}
    disabled={disabled}
    className={`chip grid size-8 place-items-center !p-0 disabled:opacity-40 ${active ? "chip-sea" : ""}`}
  >
    {children}
  </button>
);

export function Toolbar(p: Props) {
  const stateFor = (n: number) => p.states.find((s) => s.slot === n);
  const current = stateFor(p.slot);
  const off = !p.started;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Btn title={p.paused ? "Resume" : "Pause"} onClick={p.onPause} disabled={off}>
        {p.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </Btn>
      <Btn
        title="Fast-forward (Space)"
        onClick={p.onFastForward}
        active={p.fastForward}
        disabled={off}
      >
        <FastForward className="size-3.5" />
      </Btn>
      <Btn title="Screenshot" onClick={p.onScreenshot} disabled={off}>
        <Camera className="size-3.5" />
      </Btn>
      <div className="flex items-center gap-1">
        <Btn title={p.muted ? "Unmute" : "Mute"} onClick={p.onMute} active={p.muted}>
          {p.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Btn>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => p.onVolume(Number(e.target.value))}
          aria-label="Volume"
          className="hidden w-20 accent-sea sm:block"
        />
      </div>

      <div className="mx-1 flex items-center gap-1" role="group" aria-label="Save state slots">
        <span className="label-mono hidden sm:inline">State</span>
        {STATE_SLOTS.map((n) => {
          const s = stateFor(n);
          return (
            <button
              key={n}
              onClick={() => p.onSlot(n)}
              title={s ? `Slot ${n} · saved ${ago(s.createdAt)}` : `Slot ${n} · empty`}
              aria-pressed={p.slot === n}
              className={`chip relative h-8 w-11 overflow-hidden !p-0 font-mono text-[11px] ${p.slot === n ? "chip-sea ring-2 ring-sea" : ""}`}
            >
              {s?.hasThumbnail && (
                <img
                  src={`/api/saves/${p.saveId}/states/${n}/thumbnail?t=${s.createdAt}`}
                  alt=""
                  className="pixelated absolute inset-0 size-full object-cover opacity-60"
                />
              )}
              <span className="relative rounded bg-background/85 px-1 font-semibold leading-4 text-foreground">
                {n}
              </span>
            </button>
          );
        })}
        <button className="chip !py-1 text-[12px]" onClick={p.onSaveState} disabled={off || p.busy}>
          Save
        </button>
        <button
          className="chip !py-1 text-[12px] disabled:opacity-40"
          onClick={p.onLoadState}
          disabled={off || p.busy || !current}
        >
          Load
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Btn
          title={`Integer scaling ${p.integerScale ? "on" : "off"}`}
          onClick={p.onIntegerScale}
          active={p.integerScale}
        >
          <Square className="size-3.5" />
        </Btn>
        <Btn title="Normal view" onClick={() => p.onMode("Normal")} active={p.mode === "Normal"}>
          <Rows3 className="size-3.5 rotate-90" />
        </Btn>
        <Btn title="Theater view" onClick={() => p.onMode("Theater")} active={p.mode === "Theater"}>
          <span className="text-[10px] font-bold">T</span>
        </Btn>
        <Btn
          title="Fullscreen (` toggles the side panel)"
          onClick={() => p.onMode("Full")}
          active={p.mode === "Full"}
        >
          <Maximize className="size-3.5" />
        </Btn>
        <Link
          to="/settings"
          title="Controls"
          aria-label="Controls"
          className="chip grid size-8 place-items-center !p-0"
        >
          <Gamepad2 className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
