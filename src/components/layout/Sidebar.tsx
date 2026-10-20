import { Compass, Home, LibraryBig, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { AccountMenu } from "@/components/accounts/AccountMenu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/library", label: "Library", icon: LibraryBig, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
];

/** Primary launcher navigation and active-player control. */
export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <aside className="side-rail flex h-full w-[232px] shrink-0 flex-col border-r border-border/70 px-3">
      <div className="flex items-center gap-3 px-2 py-5">
        <BrandMark className="h-9 w-9 rounded-xl" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-none tracking-tight">Aether</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Launcher
          </p>
        </div>
      </div>

      <div className="px-3 pb-2 pt-7 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/65">
        Play
      </div>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors duration-150",
                isActive
                  ? "nav-active bg-primary/[0.11] text-primary"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )
            }
          >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={onOpenSettings}
        className="group mx-1 mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
      >
        <Settings className="h-[17px] w-[17px] shrink-0" />
        Settings
      </button>

      <div className="border-t border-border/70 py-3">
        <AccountMenu />
      </div>
    </aside>
  );
}

/** The Aether "spark" mark, drawn inline so it scales crisply. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        <path
          d="M12 3l7 18H5l7-18z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M8.2 15h7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
