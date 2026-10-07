import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, q } from "@/lib/api";
import { clock } from "@/lib/format";

/** Free-text notes per save, autosaved after you stop typing. */
export function NotesTab({ saveId }: { saveId: string }) {
  const { data } = useQuery(q.notes(saveId));
  const qc = useQueryClient();
  const [body, setBody] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (text: string) => api.setNotes(saveId, text),
    onSuccess: (n) => qc.setQueryData(q.notes(saveId).queryKey, n),
  });
  const latest = useRef<string | null>(null);
  latest.current = body;

  useEffect(() => {
    if (body === null || body === data?.body) return;
    const t = setTimeout(() => save.mutate(body), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  // Flush unsaved text when the tab/panel unmounts.
  useEffect(
    () => () => {
      if (
        latest.current !== null &&
        latest.current !== qc.getQueryData<{ body: string }>(q.notes(saveId).queryKey)?.body
      ) {
        void api.setNotes(saveId, latest.current);
      }
    },
    [saveId, qc],
  );

  const value = body ?? data?.body ?? "";
  const status = save.isPending
    ? "Saving…"
    : save.isError
      ? "Couldn't save — retrying when you type"
      : data?.updatedAt
        ? `Saved ${clock(data.updatedAt)}`
        : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <textarea
        value={value}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Team plans, reminders, where the next HM is…"
        aria-label="Notes for this save"
        className="min-h-[16rem] w-full flex-1 resize-none rounded-lg border border-border bg-secondary p-3 text-[13px] outline-none focus:border-sea/50"
      />
      <p className="mt-1.5 h-4 font-mono text-[10px] text-muted-foreground">{status}</p>
    </div>
  );
}
