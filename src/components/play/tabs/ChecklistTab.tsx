import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ChecklistResponse } from "@shared/api";
import { ApiError, api, q } from "@/lib/api";

export function ChecklistTab({ saveId, gameId }: { saveId: string; gameId: string }) {
  const { data, error, isLoading } = useQuery(q.checklist(saveId));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [remainingOnly, setRemainingOnly] = useState(false);

  const toggle = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api.setChecked(saveId, itemId, checked),
    onMutate: async ({ itemId, checked }) => {
      const key = q.checklist(saveId).queryKey;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistResponse>(key);
      if (prev) {
        const next = { ...prev.checked };
        if (checked) next[itemId] = Date.now();
        else delete next[itemId];
        qc.setQueryData(key, { ...prev, checked: next });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(q.checklist(saveId).queryKey, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["game", gameId] });
      void qc.invalidateQueries({ queryKey: ["games"] });
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.template.items.filter(
      (i) =>
        (category === "All" || i.category === category) &&
        (!remainingOnly || !(i.id in data.checked)) &&
        (!needle || `${i.name} ${i.location ?? ""} ${i.note ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [data, search, category, remainingOnly]);

  if (isLoading) return <p className="p-4 text-[13px] text-muted-foreground">Loading checklist…</p>;
  if (error) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        {error instanceof ApiError && error.status === 404
          ? "No checklist template for this game yet."
          : error.message}
      </p>
    );
  }
  if (!data) return null;

  const counts = (cat: string) => {
    const items = data.template.items.filter((i) => cat === "All" || i.category === cat);
    return `${items.filter((i) => i.id in data.checked).length}/${items.length}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or location…"
          aria-label="Search checklist"
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-[13px] outline-none focus:border-sea/50"
        />
        <div className="flex flex-wrap gap-1">
          {["All", ...data.template.categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`chip !px-2 !py-1 text-[11px] ${category === c ? "chip-sea" : ""}`}
            >
              {c} <span className="font-mono opacity-70">{counts(c)}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={remainingOnly}
            onChange={(e) => setRemainingOnly(e.target.checked)}
            className="accent-sea"
          />
          Remaining only
        </label>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <li className="py-6 text-center text-[13px] text-muted-foreground">Nothing matches.</li>
        )}
        {filtered.map((it) => {
          const done = it.id in data.checked;
          return (
            <li key={it.id}>
              <button
                onClick={() => toggle.mutate({ itemId: it.id, checked: !done })}
                aria-pressed={done}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-secondary px-3 py-2 text-left hover:border-sea/30"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${done ? "bg-leaf" : "bg-muted-foreground/40"}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13px] ${done ? "" : "text-muted-foreground"}`}
                  >
                    {it.name}
                  </span>
                  {(it.location || it.note) && (
                    <span className="block truncate text-[11px] text-muted-foreground/80">
                      {[it.location, it.note].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {it.category}
                </span>
                <span className="w-3 font-mono text-[11px] text-muted-foreground">
                  {done ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {data.template.source && (
        <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          {data.template.source}
        </p>
      )}
    </div>
  );
}
