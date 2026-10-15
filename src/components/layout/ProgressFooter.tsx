import { CheckCircle2, X } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useProgress } from "@/store/useProgress";
import { cn } from "@/lib/utils";

/**
 * Slim bar pinned to the bottom of the window that reflects the current
 * download / install / launch progress reported by the backend.
 */
export function ProgressFooter() {
  const progress = useProgress((state) => state.progress);
  const clear = useProgress((state) => state.clearProgress);

  if (!progress) return null;

  const hasCounts = progress.total > 0;
  const percent = hasCounts
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : progress.finished
      ? 100
      : 0;

  const done = progress.finished;

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t px-4 py-2.5 text-sm",
        done ? "bg-primary/5" : "bg-card/60",
      )}
    >
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-medium">{progress.label}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {hasCounts ? `${percent}%` : progress.stage}
            {progress.filesTotal > 1 && !done
              ? ` · ${progress.filesDone}/${progress.filesTotal} files`
              : ""}
          </span>
        </div>
        {!done && <Progress className="mt-1.5 h-1" value={percent} />}
      </div>

      {done && (
        <button
          onClick={clear}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
