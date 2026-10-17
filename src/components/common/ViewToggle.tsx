import { LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";

/** How a collection of cards is laid out. */
export type ViewMode = "grid" | "list";

/**
 * Shared localStorage key: the layout choice is one display preference rather
 * than a per-screen one, so a user who prefers lists gets lists everywhere.
 */
export const VIEW_KEY = "aether.view";

/** The default, and the fallback for anything unrecognised in storage. */
export const DEFAULT_VIEW: ViewMode = "grid";

/**
 * Shared column setup for every card grid. Beside the view mode so the grids,
 * their loading skeletons and the toggle can never drift apart.
 */
export const CARD_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/** Narrows an arbitrary stored value to a view we can actually render. */
export function asViewMode(value: unknown): ViewMode {
  return value === "list" ? "list" : "grid";
}

/** Segmented grid/list switch for page headers. */
export function ViewToggle({
  view,
  onChange,
  label,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  label: string;
}) {
  const options = [
    { value: "grid", label: "Grid view", icon: LayoutGrid },
    { value: "list", label: "List view", icon: List },
  ] as const;

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
    >
      {options.map(({ value, label: name, icon: Icon }) => (
        <Button
          key={value}
          size="icon-sm"
          variant={view === value ? "secondary" : "ghost"}
          className="rounded-sm"
          aria-label={name}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
