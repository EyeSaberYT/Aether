import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber, projectTypeColor, projectTypeLabel } from "@/lib/format";
import type { SearchHit } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** A Modrinth search result rendered as a compact card. */
export function ProjectCard({ hit }: { hit: SearchHit }) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/project/${hit.projectType}/${hit.projectId}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter") navigate(`/project/${hit.projectType}/${hit.projectId}`);
      }}
      className={cn(
        "group flex cursor-pointer gap-3.5 rounded-xl border bg-card p-4 transition-all",
        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
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

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold group-hover:text-primary">{hit.title}</p>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", projectTypeColor(hit.projectType))}>
            {projectTypeLabel(hit.projectType)}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">by {hit.author}</p>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{hit.description}</p>

        <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" /> {compactNumber(hit.downloads)}
          </span>
          {hit.displayCategories.slice(0, 3).map((category) => (
            <span key={category} className="truncate rounded bg-muted px-1.5 py-0.5">
              {category}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Loading placeholder matching {@link ProjectCard}'s layout. */
export function ProjectCardSkeleton() {
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
