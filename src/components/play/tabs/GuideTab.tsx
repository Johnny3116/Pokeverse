import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, useState } from "react";
import type { GameSummary } from "@shared/api";
import { api, q } from "@/lib/api";

export function GuideTab({ game, saveId }: { game: GameSummary; saveId: string }) {
  const guide = useQuery({ ...q.guide(game.id), enabled: game.hasMarkdownGuide });
  const marker = useQuery(q.marker(saveId));
  const qc = useQueryClient();
  const setMarker = useMutation({
    mutationFn: (sectionId: string | null) => api.setMarker(saveId, sectionId),
    onSuccess: (m) => {
      qc.setQueryData(q.marker(saveId).queryKey, m);
      void qc.invalidateQueries({ queryKey: ["game", game.id] });
    },
  });
  const sections = guide.data?.sections ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const currentId = picked ?? marker.data?.sectionId ?? sections[0]?.id ?? null;
  const current = sections.find((s) => s.id === currentId) ?? sections[0];
  const html = useMemo(
    () => (current ? DOMPurify.sanitize(marked.parse(current.markdown, { async: false })) : ""),
    [current],
  );

  // Don't flash the external site while the Markdown guide is still loading.
  if (game.hasMarkdownGuide && guide.isPending) {
    return <p className="p-4 text-[13px] text-muted-foreground">Loading guide…</p>;
  }

  if (game.hasMarkdownGuide && sections.length > 0) {
    const here = marker.data?.sectionId;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <select
            value={current?.id}
            onChange={(e) => setPicked(e.target.value)}
            aria-label="Guide section"
            className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-[13px] outline-none"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === here ? "📍 " : ""}
                {s.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => current && setMarker.mutate(current.id === here ? null : current.id)}
            className={`chip shrink-0 !py-1 font-mono text-[11px] ${current?.id === here ? "chip-primary" : ""}`}
            title="Mark this section as where you are"
          >
            {current?.id === here ? "📍 You are here" : "Mark here"}
          </button>
        </div>
        <article
          className="guide-md min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {game.guideUrl && (
          <a
            href={game.guideUrl}
            target="_blank"
            rel="noreferrer"
            className="border-t border-border px-4 py-2 font-mono text-[11px] text-sea hover:underline"
          >
            Online walkthrough ↗
          </a>
        )}
      </div>
    );
  }

  if (game.guideUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="label-mono">{game.title} walkthrough</span>
          <a
            href={game.guideUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-sea hover:underline"
          >
            Open ↗
          </a>
        </div>
        <iframe
          src={game.guideUrl}
          title={`${game.title} walkthrough`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          className="min-h-[420px] w-full flex-1 bg-background"
        />
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Blank? That site blocks embedding — use Open ↗.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 text-[13px] leading-relaxed text-muted-foreground">
      <p className="label-mono">No guide yet</p>
      <p className="mt-2">
        Drop Markdown files into{" "}
        <code className="font-mono text-foreground">guides/{game.id}/</code> on NexusBody (one file
        per town or route, e.g. <code className="font-mono">01-littleroot.md</code>), or add a{" "}
        <code className="font-mono">guideUrl</code> to games.json.
      </p>
    </div>
  );
}
