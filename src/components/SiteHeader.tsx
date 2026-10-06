import { Link } from "@tanstack/react-router";

const linkCls = "rounded-full px-3.5 py-1.5 hover:text-foreground transition-colors";
const activeCls = { className: "bg-secondary font-medium text-foreground" };

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-primary ring-4 ring-primary/25">
            <span className="size-2 rounded-full bg-primary-foreground" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">SUNSTONE</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/" className={linkCls} activeProps={activeCls} activeOptions={{ exact: true }}>Library</Link>
          <Link to="/play/$gameId/$saveId" params={{ gameId: "emerald-imperium", saveId: "slot-3" }} className={linkCls} activeProps={activeCls}>Play</Link>
          <Link to="/settings" className={linkCls} activeProps={activeCls}>Settings</Link>
        </nav>
        <div className="ml-auto hidden items-center gap-2 font-mono text-[11px] text-muted-foreground sm:flex">
          <span className="rounded-full border border-border px-2.5 py-1">Dex 142/386</span>
          <span className="rounded-full border border-sea/30 bg-sea/10 px-2.5 py-1 text-sea">● synced</span>
        </div>
      </div>
    </header>
  );
}
