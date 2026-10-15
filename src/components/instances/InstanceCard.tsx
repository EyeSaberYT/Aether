import { Play, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/Spinner";
import { loaderColor, loaderLabel, relativeTime } from "@/lib/format";
import type { InstanceSummary } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface InstanceCardProps {
  instance: InstanceSummary;
  running: boolean;
  launching: boolean;
  onPlay: (instance: InstanceSummary) => void;
}

/** A single card in the library grid. */
export function InstanceCard({ instance, running, launching, onPlay }: InstanceCardProps) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/library/${instance.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter") navigate(`/library/${instance.id}`);
      }}
      className={cn(
        "group flex cursor-pointer flex-col gap-4 rounded-xl border bg-card p-4 transition-all",
        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      <div className="flex items-start gap-3">
        <InstanceIcon
          icon={instance.icon}
          name={instance.name}
          id={instance.id}
          className="h-14 w-14 text-base"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{instance.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[11px]">
              {instance.gameVersion}
            </Badge>
            <Badge variant="outline" className={cn("text-[11px]", loaderColor(instance.loader))}>
              {loaderLabel(instance.loader)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {instance.modCount} {instance.modCount === 1 ? "mod" : "mods"}
        </span>
        <span>Played {relativeTime(instance.lastPlayed)}</span>
      </div>

      <Button
        variant={running ? "secondary" : "brand"}
        className="w-full"
        disabled={launching}
        onClick={(event) => {
          event.stopPropagation();
          onPlay(instance);
        }}
      >
        {launching ? (
          <Spinner />
        ) : running ? (
          <Square className="fill-current" />
        ) : (
          <Play className="fill-current" />
        )}
        {running ? "Running" : launching ? "Launching…" : "Play"}
      </Button>
    </div>
  );
}
