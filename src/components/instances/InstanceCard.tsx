import { Play, ShieldCheck, Square } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Spinner } from "@/components/common/Spinner";
import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loaderColor, loaderLabel, relativeTime } from "@/lib/format";
import type { InstanceSummary } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface InstanceCardProps {
  instance: InstanceSummary;
  running: boolean;
  launching: boolean;
  onPlay: (instance: InstanceSummary) => void;
  /** When provided, each layout shows a scan control for this instance. */
  onScan?: (instance: InstanceSummary) => void;
}

/**
 * Click-to-open surface shared by both layouts. The whole row or card is the
 * target, so keyboard and pointer navigation live in one place.
 */
function InstanceSurface({
  instance,
  className,
  children,
}: Pick<InstanceCardProps, "instance"> & { className?: string; children: ReactNode }) {
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
        "group cursor-pointer rounded-xl border bg-card transition-[border-color,background-color] duration-150 ease-out",
        "hover:border-border/90 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Play/stop control. Both layouts use it so their labels and disabled states
 * can never disagree.
 */
function InstancePlayButton({
  instance,
  running,
  launching,
  onPlay,
  className,
}: InstanceCardProps & { className?: string }) {
  return (
    <Button
      variant={running ? "secondary" : "brand"}
      size="sm"
      className={className}
      disabled={launching}
      onClick={(event) => {
        // Both layouts open on click, so launching must not also navigate.
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
  );
}

/**
 * Shield control for the content scan. Same reasoning as the play button: it
 * lives inside a surface that navigates on click, so it stops the event.
 */
function InstanceScanButton({ instance, onScan }: Pick<InstanceCardProps, "instance" | "onScan">) {
  if (!onScan) return null;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="Scan mods and packs"
      onClick={(event) => {
        event.stopPropagation();
        onScan(instance);
      }}
    >
      <ShieldCheck />
    </Button>
  );
}

/** A single card in the library grid. */
export function InstanceCard({ instance, running, launching, onPlay, onScan }: InstanceCardProps) {
  return (
    <InstanceSurface instance={instance} className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <InstanceIcon
          icon={instance.icon}
          name={instance.name}
          id={instance.id}
          className="h-10 w-10 rounded-md text-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{instance.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-[11px]">
              {instance.gameVersion}
            </Badge>
            <Badge variant="outline" className={cn("text-[11px]", loaderColor(instance.loader))}>
              {loaderLabel(instance.loader)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {instance.modCount} {instance.modCount === 1 ? "mod" : "mods"}
        </span>
        <span className="truncate">Played {relativeTime(instance.lastPlayed)}</span>
      </div>

      <div className="flex items-center gap-2">
        <InstancePlayButton
          instance={instance}
          running={running}
          launching={launching}
          onPlay={onPlay}
          className="flex-1"
        />
        <InstanceScanButton instance={instance} onScan={onScan} />
      </div>
    </InstanceSurface>
  );
}

/**
 * One instance per row, for libraries where scanning beats browsing. The
 * fixed-width columns keep version, mod count and last-played aligned across
 * every row, and drop away as the window narrows rather than crushing the name.
 */
export function InstanceRow({ instance, running, launching, onPlay, onScan }: InstanceCardProps) {
  return (
    <InstanceSurface instance={instance} className="flex items-center gap-3 px-3 py-2.5">
      <InstanceIcon
        icon={instance.icon}
        name={instance.name}
        id={instance.id}
        className="h-9 w-9 rounded-lg text-xs"
      />

      <p className="min-w-0 flex-1 truncate text-sm font-medium">{instance.name}</p>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        <Badge variant="outline" className="font-mono text-[11px]">
          {instance.gameVersion}
        </Badge>
        <Badge variant="outline" className={cn("text-[11px]", loaderColor(instance.loader))}>
          {loaderLabel(instance.loader)}
        </Badge>
      </div>

      <span className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
        {instance.modCount} {instance.modCount === 1 ? "mod" : "mods"}
      </span>
      <span className="hidden w-32 shrink-0 truncate text-right text-xs text-muted-foreground lg:block">
        Played {relativeTime(instance.lastPlayed)}
      </span>

      <div className="ml-1 flex shrink-0 items-center gap-1">
        <InstanceScanButton instance={instance} onScan={onScan} />
        <InstancePlayButton
          instance={instance}
          running={running}
          launching={launching}
          onPlay={onPlay}
        />
      </div>
    </InstanceSurface>
  );
}
