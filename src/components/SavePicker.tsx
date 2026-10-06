import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { GameSummary } from "@shared/api";
import { BoxArt } from "@/components/BoxArt";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { api, q } from "@/lib/api";
import { ago, playtime } from "@/lib/format";

export function SavePicker({ game, onClose }: { game: GameSummary; onClose: () => void }) {
  const { data, isLoading } = useQuery(q.game(game.id));
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.createSave(game.id, name.trim() || "Main run"),
    onSuccess: async (save) => {
      void qc.invalidateQueries({ queryKey: ["games"] });
      await qc.invalidateQueries({ queryKey: ["game", game.id] });
      void navigate({ to: "/play/$gameId/$saveId", params: { gameId: game.id, saveId: save.id } });
    },
  });
  const saves = data?.saves ?? [];

  return (
    // Radix dialog: closes on Esc / outside click, traps focus, restores it on close.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="tile fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto !bg-card"
        >
          <BoxArt game={game} className="h-32 w-full" />
          <div className="p-5">
            <p className="label-mono">Choose a save</p>
            <DialogTitle className="mt-1 text-xl font-bold">Pokémon {game.title}</DialogTitle>
            {!game.hasRom && (
              <p className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[13px] text-primary">
                ROM file not found on NexusBody — check games.json.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Loading saves…</p>}
              {saves.map((s) => (
                <Link
                  key={s.id}
                  to="/play/$gameId/$saveId"
                  params={{ gameId: game.id, saveId: s.id }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5 hover:border-sea/40"
                >
                  <span
                    className={`size-2 rounded-full ${s.hasSram ? "bg-sea" : "bg-muted-foreground/40"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.checklist.dexTotal > 0 &&
                        `Dex ${s.checklist.dexDone}/${s.checklist.dexTotal} · `}
                      {ago(s.lastPlayedAt ?? s.createdAt)}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {playtime(s.playtimeSec)}
                  </span>
                </Link>
              ))}
              {creating ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                >
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    placeholder={saves.length ? "Nuzlocke" : "Main run"}
                    aria-label="Save name"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-sea/50"
                  />
                  <button
                    disabled={create.isPending}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {create.isPending ? "Creating…" : "Create"}
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  + New save
                </button>
              )}
              {create.error && <p className="text-xs text-primary">{create.error.message}</p>}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
