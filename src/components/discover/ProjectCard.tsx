import { Download } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { ViewMode } from "@/components/common/ViewToggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber, projectTypeColor, projectTypeLabel } from "@/lib/format";
import type { SearchHit } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** Project icon, or the title's initial when Modrinth has none. */
function ProjectIcon({ hit, className }: { hit: SearchHit; className: string }) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
      {hit.iconUrl ? (
        <img
          src={hit.iconUrl}
          alt={hit.title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
          {hit.title.slice(0, 1)}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ hit }: { hit: SearchHit }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[10px]", projectTypeColor(hit.projectType))}
    >
      {projectTypeLabel(hit.projectType)}
    </Badge>
  );
}

/** Download count plus the leading categories. */
function ProjectMeta({ hit, className }: { hit: SearchHit; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)}>
      <span className="inline-flex shrink-0 items-center gap-1">
        <Download className="h-3.5 w-3.5" /> {compactNumber(hit.downloads)}
      </span>
      {hit.displayCategories.slice(0, 3).map((category) => (
        <span key={category} className="truncate rounded bg-muted px-1.5 py-0.5">
          {category}
        </span>
      ))}
    </div>
  );
}

/**
 * A Modrinth search result. `list` is the full-width row; `grid` is a compact
 * tile that fits several per row, for browsing by cover rather than by text.
 */
export function ProjectCard({ hit, layout }: { hit: SearchHit; layout: ViewMode }) {
  const navigate = useNavigate();
  const open = () => navigate(`/project/${hit.projectType}/${hit.projectId}`);

  const surface = {
    role: "button" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") open();
    },
  };

  const base = cn(
    "group cursor-pointer rounded-xl border bg-card transition-[border-color,background-color] duration-150 ease-out",
    "hover:border-border/90 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  if (layout === "grid") {
    return (
      <div {...surface} className={cn(base, "flex flex-col gap-3 p-3.5")}>
        <div className="flex items-start gap-3">
          <ProjectIcon hit={hit} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold group-hover:text-primary">{hit.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">by {hit.author}</p>
            <div className="mt-1.5">
              <TypeBadge hit={hit} />
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">{hit.description}</p>

        <ProjectMeta
          hit={hit}
          className="mt-auto flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div {...surface} className={cn(base, "flex gap-3.5 p-3.5")}>
      <ProjectIcon hit={hit} className="h-16 w-16" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold group-hover:text-primary">{hit.title}</p>
          <TypeBadge hit={hit} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">by {hit.author}</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{hit.description}</p>
        <ProjectMeta hit={hit} className="mt-2.5" />
      </div>
    </div>
  );
}

/** Loading placeholder matching {@link ProjectCard}'s layout. */
export function ProjectCardSkeleton({ layout }: { layout: ViewMode }) {
  if (layout === "grid") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }

  return (
    <div className="flex gap-3.5 rounded-xl border bg-card p-4">
      <Skeleton className="h-16 w-16 rounded-lg" />
      <div className="flex-1 space-y-2.5 py-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}
