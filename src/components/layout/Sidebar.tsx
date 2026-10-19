import { Compass, Home, LibraryBig, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

import { AccountMenu } from "@/components/accounts/AccountMenu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/library", label: "Library", icon: LibraryBig, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

/** Fixed navigation rail with the brand mark and the account switcher. */
export function Sidebar() {
  return (
    <aside className="relative flex h-full w-[220px] shrink-0 flex-col border-r bg-[#17191c]">
      <div className="flex items-center gap-3 px-4 py-5">
        <BrandMark className="h-8 w-8 rounded-lg" />
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">Aether</p>
          <p className="mt-1 text-[10px] text-muted-foreground">MINECRAFT LAUNCHER</p>
        </div>
      </div>

      <div className="px-4 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
        Workspace
      </div>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 px-2.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-[9px] text-[13px] font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary/10 text-primary before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-white/[0.045] hover:text-foreground",
              )
            }
          >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-2.5">
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
