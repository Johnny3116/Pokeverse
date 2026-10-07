import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { q } from "@/lib/api";

const linkCls = "rounded-full px-3.5 py-1.5 transition-colors hover:text-foreground";
const activeCls = { className: "bg-secondary font-medium text-foreground" };

export function SiteHeader() {
  const { data: cont } = useQuery(q.continue());
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-primary ring-4 ring-primary/25">
            <span className="size-2 rounded-full bg-primary-foreground" />
          </span>
          <span className="hidden text-[15px] font-extrabold tracking-tight sm:inline">
            POKEVERSE
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/" className={linkCls} activeProps={activeCls} activeOptions={{ exact: true }}>
            Library
          </Link>
          {cont && (
            <Link
              to="/play/$gameId/$saveId"
              params={{ gameId: cont.game.id, saveId: cont.save.id }}
              className={linkCls}
              activeProps={activeCls}
            >
              Play
            </Link>
          )}
          <Link to="/settings" className={linkCls} activeProps={activeCls}>
            Settings
          </Link>
        </nav>
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground md:inline">
          private · tailnet only
        </span>
      </div>
    </header>
  );
}
