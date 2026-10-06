import type { GameSummary } from "@shared/api";
import { cn } from "@/lib/utils";

const REGION_TINT: Record<string, string> = {
  Hoenn: "from-sea/30 via-sea/5",
  Kanto: "from-primary/30 via-primary/5",
};

/** Box art from NexusBody, or a generated title tile when none is installed. */
export function BoxArt({ game, className }: { game: GameSummary; className?: string }) {
  if (game.hasBoxArt) {
    return (
      <img
        src={`/api/games/${game.id}/boxart`}
        alt=""
        loading="lazy"
        className={cn("object-cover object-top", className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "relative grid place-items-center overflow-hidden bg-gradient-to-br to-transparent",
        REGION_TINT[game.region] ?? "from-leaf/25 via-leaf/5",
        className,
      )}
    >
      <span className="px-4 text-center text-2xl font-extrabold leading-tight tracking-tight text-foreground/80">
        {game.title}
      </span>
      <span className="label-mono absolute bottom-3 left-4">{game.region || "GBA"}</span>
    </div>
  );
}
