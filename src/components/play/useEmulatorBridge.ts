import { useCallback, useEffect, useRef, useState } from "react";
import type { FromHost, HostInit, ToHost } from "@shared/emulator-protocol";

export type BridgeState = {
  ready: boolean;
  started: boolean;
  paused: boolean;
  fastForward: boolean;
  dirty: boolean;
  status: string;
  lastSavedAt: number | null;
  error: string | null;
};

type Handlers = {
  onStateSaved?: (slot: number) => void;
  onStateLoaded?: (slot: number) => void;
  onScreenshot?: (png: ArrayBuffer) => void;
  onLockLost?: () => void;
  onHotkey?: (action: "drawer") => void;
  onError?: (message: string) => void;
};

/** Talks to the emulator iframe; also tracks seconds of active play for playtime. */
export function useEmulatorBridge(init: HostInit | null, handlers: Handlers) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<BridgeState>({
    ready: false,
    started: false,
    paused: false,
    fastForward: false,
    dirty: false,
    status: "Loading…",
    lastSavedAt: null,
    error: null,
  });
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const initRef = useRef(init);
  initRef.current = init;
  const flushWaiters = useRef<(() => void)[]>([]);
  const playedMs = useRef(0);

  const post = useCallback((msg: ToHost) => {
    frameRef.current?.contentWindow?.postMessage(msg, location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromHost>) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data;
      const h = handlersRef.current;
      switch (msg.type) {
        case "host-ready":
          setState((s) => ({ ...s, ready: true }));
          if (initRef.current) post({ type: "init", init: initRef.current });
          break;
        case "status":
          setState((s) => ({ ...s, status: msg.text }));
          break;
        case "started":
          setState((s) => ({ ...s, started: true, status: "" }));
          break;
        case "paused":
          setState((s) => ({ ...s, paused: msg.paused }));
          break;
        case "fast-forward":
          setState((s) => ({ ...s, fastForward: msg.on }));
          break;
        case "sram-saved":
          setState((s) => ({ ...s, lastSavedAt: msg.at, error: null }));
          break;
        case "sram-dirty":
          setState((s) => ({ ...s, dirty: msg.dirty }));
          break;
        case "sram-error":
          setState((s) => ({ ...s, error: msg.message }));
          if (msg.lockLost) h.onLockLost?.();
          break;
        case "state-saved":
          h.onStateSaved?.(msg.slot);
          break;
        case "state-loaded":
          h.onStateLoaded?.(msg.slot);
          break;
        case "screenshot":
          h.onScreenshot?.(msg.png);
          break;
        case "flushed":
          flushWaiters.current.splice(0).forEach((r) => r());
          break;
        case "hotkey":
          h.onHotkey?.(msg.action);
          break;
        case "error":
          h.onError?.(msg.message);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  // If init arrives after the host announced itself, send it now.
  useEffect(() => {
    if (init && state.ready && !state.started) post({ type: "init", init });
    // Only when init first becomes available / host becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init !== null, state.ready]);

  // Count active play time: running, not paused, tab visible.
  useEffect(() => {
    if (!state.started || state.paused) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible") playedMs.current += Math.min(now - last, 5000);
      last = now;
    }, 1000);
    return () => clearInterval(id);
  }, [state.started, state.paused]);

  const takePlayedSec = useCallback(() => {
    const sec = Math.floor(playedMs.current / 1000);
    playedMs.current -= sec * 1000;
    return sec;
  }, []);

  /** Ask the host to upload pending SRAM; resolves when done or after a timeout. */
  const flush = useCallback(
    (timeoutMs = 4000) =>
      new Promise<void>((resolve) => {
        if (!frameRef.current?.contentWindow) return resolve();
        const t = setTimeout(resolve, timeoutMs);
        flushWaiters.current.push(() => {
          clearTimeout(t);
          resolve();
        });
        post({ type: "flush-sram" });
      }),
    [post],
  );

  return { frameRef, state, post, flush, takePlayedSec };
}
