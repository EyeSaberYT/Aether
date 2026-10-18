import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Camera, ChevronLeft, ChevronRight, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/common/Spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { screenshots as screenshotsApi, system } from "@/lib/api";
import { formatBytes, relativeTime } from "@/lib/format";
import type { Screenshot, ScreenshotsFile } from "@/lib/tauri";

/**
 * The PNGs the game has dropped in this instance's `screenshots/` folder.
 *
 * A window onto the folder rather than a library: nothing is uploaded, renamed
 * or cropped, and Aether only ever reads one and — if asked — deletes it. The
 * shots can be taken while the game runs, which is why Refresh sits in the
 * header rather than the tab only ever loading once.
 */
export function ScreenshotsTab({ instanceId }: { instanceId: string }) {
  const [file, setFile] = useState<ScreenshotsFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [using, setUsing] = useState(false);
  /** The shot the lightbox is showing, by index into `file.screenshots`. */
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        setFile(await screenshotsApi.list(instanceId));
      } catch (cause) {
        setError(cause);
      } finally {
        setLoading(false);
      }
    },
    [instanceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(shot: Screenshot) {
    setUsing(true);
    try {
      setFile(await screenshotsApi.remove(instanceId, shot.name));
      setOpenIndex(null);
      toast.success(`Deleted ${shot.name}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUsing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner /> Looking for screenshots…
      </div>
    );
  }

  if (error !== null || file === null) {
    return (
      <EmptyState
        icon={Camera}
        title="Couldn't read the screenshot folder"
        description={error instanceof Error ? error.message : String(error)}
        action={
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const shots = file.screenshots;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {shots.length === 0
            ? "No screenshots yet"
            : `${shots.length} screenshot${shots.length === 1 ? "" : "s"}, newest first`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load(true)}>
            <RefreshCw /> Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!file.exists}
            onClick={() => void reveal(file.path)}
          >
            <FolderOpen /> Open folder
          </Button>
        </div>
      </div>

      {shots.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No screenshots yet"
          description="Press F2 in game and the shot lands here, ready to view or clear out."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shots.map((shot, index) => (
            <button
              key={shot.path}
              type="button"
              onClick={() => setOpenIndex(index)}
              title={`${shot.name} · ${formatBytes(shot.size)}`}
              className="group overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={convertFileSrc(shot.path)}
                alt={shot.name}
                className="aspect-video w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                {relativeTime(shot.taken)}
              </span>
            </button>
          ))}
        </div>
      )}

      <Lightbox
        shots={shots}
        index={openIndex}
        folder={file.path}
        busy={using}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
        onDelete={remove}
      />
    </div>
  );
}

/**
 * One screenshot, full size, with the neighbours a keypress away.
 *
 * Deleting asks first, inside the same dialog: the shot is open in front of the
 * user, and a second dialog on top of this one would only get in the way.
 */
function Lightbox({
  shots,
  index,
  folder,
  busy,
  onIndexChange,
  onClose,
  onDelete,
}: {
  shots: Screenshot[];
  index: number | null;
  folder: string;
  busy: boolean;
  onIndexChange: (index: number | null) => void;
  onClose: () => void;
  onDelete: (shot: Screenshot) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const shot = index === null ? null : (shots[index] ?? null);

  // A fresh shot means a fresh question.
  useEffect(() => setConfirming(false), [index]);

  if (shot === null) {
    return null;
  }

  const step = (by: number) => {
    if (index === null) return;
    const next = index + by;
    if (next >= 0 && next < shots.length) onIndexChange(next);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate font-mono text-sm">{shot.name}</DialogTitle>
          <DialogDescription>
            {formatBytes(shot.size)} ·{" "}
            {shot.taken === null ? "unknown date" : relativeTime(shot.taken)} ·{" "}
            {index === null ? 0 : index + 1} of {shots.length}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex max-h-[65vh] items-center justify-center overflow-hidden rounded-lg border bg-black/40">
          <img
            src={convertFileSrc(shot.path)}
            alt={shot.name}
            className="max-h-[65vh] w-auto max-w-full object-contain"
          />

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 bg-background/70 hover:bg-background"
            title="Previous screenshot"
            disabled={index === 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 bg-background/70 hover:bg-background"
            title="Next screenshot"
            disabled={index === null || index >= shots.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
        </div>

        {confirming ? (
          <>
            <p className="text-sm text-muted-foreground">
              Delete this screenshot? The PNG goes for good — nothing keeps a copy.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => onDelete(shot)}>
                {busy ? <Spinner /> : <Trash2 />} Delete
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => void reveal(folder)}>
              <FolderOpen /> Open folder
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Open a folder in the OS file manager, complaining if it isn't there. */
async function reveal(path: string) {
  try {
    await system.reveal(path);
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : String(cause));
  }
}
