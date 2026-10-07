export const NUZLOCKE_TRACKER_URL = "https://nuzlocketracker.org/";

export function NuzlockeTab() {
  const openTracker = () => {
    const w = 520;
    window.open(
      NUZLOCKE_TRACKER_URL,
      "nuzlocke-tracker",
      `popup,width=${w},height=${window.outerHeight},left=${window.screenX + window.outerWidth - w},top=${window.screenY}`,
    );
  };
  return (
    <div className="space-y-3 p-4">
      <p className="label-mono">Nuzlocke tracker</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Nuzlocke Tracker can't be shown inside this panel (the site blocks embedding), so it opens
        in its own window next to the game.
      </p>
      <button
        onClick={openTracker}
        className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/85"
      >
        Open tracker window
      </button>
      <a
        href={NUZLOCKE_TRACKER_URL}
        target="_blank"
        rel="noreferrer"
        className="block text-center font-mono text-[11px] text-sea hover:underline"
      >
        or open in a new tab ↗
      </a>
    </div>
  );
}
