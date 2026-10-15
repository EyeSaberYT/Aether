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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card/40">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark />
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">Aether</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Minecraft launcher</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
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
