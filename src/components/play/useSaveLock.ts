import { useCallback, useEffect, useRef, useState } from "react";
import { LOCK_HEARTBEAT_MS, type LockInfo } from "@shared/api";
import { api, isLockConflict } from "@/lib/api";
import { clientId, deviceLabel } from "@/lib/device";

export type LockState =
  | { status: "acquiring" }
  | { status: "held" }
  | { status: "conflict"; heldBy: LockInfo }
  | { status: "lost"; heldBy: LockInfo | null }
  | { status: "error"; message: string };

/**
 * Holds the per-save lock while the Play page is open: acquire on mount, renew on a
 * heartbeat (which also reports playtime), release on leave.
 */
export function useSaveLock(saveId: string, takePlayedSec: () => number) {
  const [state, setState] = useState<LockState>({ status: "acquiring" });
  const id = useRef(clientId()).current;
  const label = useRef(deviceLabel()).current;
  const takeRef = useRef(takePlayedSec);
  takeRef.current = takePlayedSec;

  const acquire = useCallback(
    async (takeover = false) => {
      setState({ status: "acquiring" });
      try {
        await api.lock(saveId, { clientId: id, label, takeover });
        setState({ status: "held" });
      } catch (e) {
        if (isLockConflict(e)) setState({ status: "conflict", heldBy: e.body.heldBy });
        else setState({ status: "error", message: (e as Error).message });
      }
    },
    [saveId, id, label],
  );

  useEffect(() => {
    void acquire();
  }, [acquire]);

  // Heartbeat while held.
  const held = state.status === "held";
  useEffect(() => {
    if (!held) return;
    const beat = async () => {
      try {
        await api.lock(saveId, { clientId: id, label, playedSec: takeRef.current() });
      } catch (e) {
        if (isLockConflict(e)) setState({ status: "lost", heldBy: e.body.heldBy });
        // Network blips: keep playing; the next beat retries.
      }
    };
    const t = setInterval(() => void beat(), LOCK_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [held, saveId, id, label]);

  // Release on leave (route change or tab close).
  useEffect(() => {
    const release = () => api.unlockBeacon(saveId, id);
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [saveId, id]);

  const markLost = useCallback(() => setState({ status: "lost", heldBy: null }), []);

  return { state, clientId: id, acquire, markLost };
}
