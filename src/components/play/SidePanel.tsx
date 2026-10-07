import { BookOpen, ListChecks, NotebookPen, Skull, Table2 } from "lucide-react";
import type { GameSummary } from "@shared/api";
import { ChecklistTab } from "./tabs/ChecklistTab";
import { GuideTab } from "./tabs/GuideTab";
import { NotesTab } from "./tabs/NotesTab";
import { NuzlockeTab } from "./tabs/NuzlockeTab";
import { ReferenceTab } from "./tabs/ReferenceTab";

export const TABS = ["Guide", "Checklist", "Notes", "Ref", "Nuzlocke"] as const;
export type Tab = (typeof TABS)[number];

const ICONS = {
  Guide: BookOpen,
  Checklist: ListChecks,
  Notes: NotebookPen,
  Ref: Table2,
  Nuzlocke: Skull,
};
export const TabIcon = ({ tab, className }: { tab: Tab; className?: string }) => {
  const Icon = ICONS[tab];
  return <Icon className={className} />;
};

export function SidePanel({
  tab,
  onTab,
  game,
  saveId,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  game: GameSummary;
  saveId: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        className="flex shrink-0 overflow-x-auto border-b border-border font-mono text-[10.5px] uppercase tracking-[0.06em]"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={`flex-1 whitespace-nowrap border-b-2 px-1.5 py-2.5 ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "Guide" && <GuideTab game={game} saveId={saveId} />}
        {tab === "Checklist" && <ChecklistTab saveId={saveId} gameId={game.id} />}
        {tab === "Notes" && <NotesTab saveId={saveId} />}
        {tab === "Ref" && <ReferenceTab mechanics={game.mechanics} />}
        {tab === "Nuzlocke" && <NuzlockeTab />}
      </div>
    </div>
  );
}
