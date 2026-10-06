// postMessage protocol between the Play page (parent) and /emulator.html (iframe host).
// Both are same-origin; messages from any other origin are ignored.

export type HostInit = {
  gameId: string;
  saveId: string;
  clientId: string;
  hasBios: boolean;
  volume: number;
  muted: boolean;
  fastForwardRatio: number;
  fastForwardKey: string;
  keyBindings: Record<string, string>;
  padBindings: Record<string, string>;
};

export type ToHost =
  | { type: "init"; init: HostInit }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "set-fast-forward"; on: boolean }
  | { type: "set-volume"; volume: number; muted: boolean }
  | { type: "save-state"; slot: number }
  | { type: "load-state"; slot: number }
  | { type: "screenshot" }
  | { type: "flush-sram" }
  | { type: "lock-lost" }
  | { type: "focus" };

export type FromHost =
  | { type: "host-ready" }
  | { type: "status"; text: string }
  | { type: "started" }
  | { type: "paused"; paused: boolean }
  | { type: "fast-forward"; on: boolean }
  | { type: "sram-saved"; at: number }
  | { type: "sram-error"; message: string; lockLost: boolean }
  | { type: "state-saved"; slot: number }
  | { type: "state-loaded"; slot: number }
  | { type: "screenshot"; png: ArrayBuffer }
  /** SRAM differs from the server copy (an upload is pending). */
  | { type: "sram-dirty"; dirty: boolean }
  /** Reply to flush-sram once the upload attempt finished. */
  | { type: "flushed" }
  /** Keys pressed inside the iframe that the Play page handles. */
  | { type: "hotkey"; action: "drawer" }
  | { type: "error"; message: string };
