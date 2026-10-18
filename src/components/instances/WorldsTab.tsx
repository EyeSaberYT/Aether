import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Archive, ArchiveRestore, FolderOpen, Globe, TriangleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { system, worlds as worldsApi } from "@/lib/api";
import { formatBytes, relativeTime } from "@/lib/format";
import type { World, WorldBackup, WorldsOverview } from "@/lib/tauri";

/**
 * The instance's worlds and the backups Aether has taken of them.
 *
 * A backup is a zip of a whole world folder, written beside the game directory.
 * Both directions touch files the game is actively writing while it runs, so the
 * tab refuses to back up or restore until the instance is closed; deleting a
 * backup is only a zip, so that stays available.
 */
export function WorldsTab({
  instanceId,
  isRunning,
}: {
  instanceId: string;
  /** The game is running, so its worlds are being written. */
  isRunning: boolean;
}) {
  const [overview, setOverview] = useState<WorldsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  /** What is in flight, as `<action>:<name>`, so only that row goes quiet. */
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        setOverview(await worldsApi.overview(instanceId));
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

  async function deleteBackup(backup: WorldBackup) {
    setConfirm(null);
    setBusy(`delete:${backup.name}`);
    try {
      setOverview(await worldsApi.deleteBackup(instanceId, backup.name));
      toast.success(`Deleted ${backup.name}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function backUp(world: string) {
    setBusy(`backup:${world}`);
    try {
      const next = await worldsApi.backup(instanceId, world);
      setOverview(next);
      toast.success(`Backed up “${world}”`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function restore(backup: WorldBackup) {
    setConfirm(null);
    setBusy(`restore:${backup.name}`);
    try {
      const result = await worldsApi.restore(instanceId, backup.name);
      toast.success(
        result.safety
          ? `Restored “${result.world}”. The world it replaced is saved as “${result.safety}”.`
          : `Restored “${result.world}”`,
      );
      // Restoring rewrites the world folder, so the sizes and dates moved.
      await load(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner /> Looking through this instance's worlds…
      </div>
    );
  }

  if (error !== null || overview === null) {
    return (
      <EmptyState
        icon={Globe}
        title="Couldn't read this instance's worlds"
        description={error instanceof Error ? error.message : String(error)}
        action={
          <Button variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const groups = groupBackups(overview);
  const totalBackups = overview.backups.length;

  return (
    <div className="space-y-8">
      {isRunning && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300">
          <p className="font-medium">This instance is running</p>
          <p className="mt-0.5">
            Minecraft writes to its world folders while it plays, so Aether can't back up or restore
            one until this instance closes. Backups can still be deleted.
          </p>
        </Card>
      )}

      {/* ---- Worlds ---------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            Worlds in this instance
            <span className="ml-2 font-normal text-muted-foreground">
              {overview.worlds.length === 0
                ? "none yet"
                : `${overview.worlds.length} world${overview.worlds.length === 1 ? "" : "s"}`}
            </span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reveal(overview.savesPath)}
            disabled={overview.worlds.length === 0}
          >
            <FolderOpen /> Open saves
          </Button>
        </div>

        {overview.worlds.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No worlds yet"
            description="Worlds turn up here once you have played this instance and the game has created a saves folder."
          />
        ) : (
          <div className="space-y-2">
            {overview.worlds.map((world) => (
              <div
                key={world.path}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <WorldIcon world={world} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{world.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(world.size)} ·{" "}
                    {world.modified === null
                      ? "never played"
                      : `played ${relativeTime(world.modified)}`}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Open world folder"
                  onClick={() => void reveal(world.path)}
                >
                  <FolderOpen />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRunning || busy !== null}
                  title={isRunning ? "Close the game first" : `Zip “${world.name}” into a backup`}
                  onClick={() => void backUp(world.name)}
                >
                  {busy === `backup:${world.name}` ? <Spinner /> : <Archive />} Back up
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Backups --------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            Backups
            <span className="ml-2 font-normal text-muted-foreground">
              {totalBackups === 0
                ? "none yet"
                : `${totalBackups} backup${totalBackups === 1 ? "" : "s"}`}
            </span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            disabled={totalBackups === 0}
            onClick={() => void reveal(overview.backupsPath)}
          >
            <FolderOpen /> Open backups
          </Button>
        </div>

        {totalBackups === 0 ? (
          <EmptyState
            icon={Archive}
            title="No backups yet"
            description="Back up a world and it becomes a zip here, ready to put back if something goes wrong."
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.world} className="space-y-2">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{group.world}</span>
                  {!group.exists && (
                    <Badge variant="muted" className="gap-1 text-[10px]">
                      <TriangleAlert className="h-3 w-3" /> not in this instance
                    </Badge>
                  )}
                </p>

                {group.backups.map((backup) => (
                  <div
                    key={backup.name}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Archive className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs">{backup.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatBytes(backup.size)} ·{" "}
                        {backup.created === null ? "unknown date" : relativeTime(backup.created)}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRunning || busy !== null}
                      title={
                        isRunning
                          ? "Close the game first"
                          : group.exists
                            ? `Replace “${group.world}” with this backup`
                            : `Recreate “${group.world}” from this backup`
                      }
                      onClick={() => setConfirm({ kind: "restore", backup })}
                    >
                      {busy === `restore:${backup.name}` ? <Spinner /> : <ArchiveRestore />} Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete this backup"
                      disabled={busy !== null}
                      onClick={() => setConfirm({ kind: "delete", backup })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        target={confirm}
        worldExists={
          confirm === null
            ? false
            : overview.worlds.some((world) => world.name === confirm.backup.world)
        }
        busy={busy !== null}
        onClose={() => setConfirm(null)}
        onRestore={(backup) => void restore(backup)}
        onDelete={(backup) => void deleteBackup(backup)}
      />
    </div>
  );
}

/** The dialog asking about one backup. */
interface ConfirmTarget {
  kind: "restore" | "delete";
  backup: WorldBackup;
}

/**
 * Ask before the two things that cannot be undone from here: putting a backup
 * back over a world, and deleting one.
 */
function ConfirmDialog({
  target,
  worldExists,
  busy,
  onClose,
  onRestore,
  onDelete,
}: {
  target: ConfirmTarget | null;
  /** Whether the world this backup came from is still in the instance. */
  worldExists: boolean;
  busy: boolean;
  onClose: () => void;
  onRestore: (backup: WorldBackup) => void;
  onDelete: (backup: WorldBackup) => void;
}) {
  const backup = target?.backup ?? null;
  const world = backup?.world ?? "";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.kind === "delete" ? "Delete this backup?" : `Restore “${world}”?`}
          </DialogTitle>
          <DialogDescription>
            {target?.kind === "delete" ? (
              <>
                <span className="font-mono">{backup?.name}</span> is deleted. A zip can't be brought
                back, so this one is gone for good.
              </>
            ) : worldExists ? (
              <>
                The world in this instance is replaced with what{" "}
                <span className="font-mono">{backup?.name}</span> holds. Everything currently in it
                is zipped into a new backup first, so this can be undone.
              </>
            ) : (
              <>
                “{world}” is no longer in this instance, so it is recreated from{" "}
                <span className="font-mono">{backup?.name}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {target?.kind === "delete" ? (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => backup && onDelete(backup)}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <Button variant="brand" disabled={busy} onClick={() => backup && onRestore(backup)}>
              <ArchiveRestore /> Restore
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The icon the game drew for a world, or a placeholder.
 *
 * `icon.png` lives inside the world folder and the game overwrites it as the
 * player moves, so it is drawn straight from disk while it lasts.
 */
function WorldIcon({ world }: { world: World }) {
  const [broken, setBroken] = useState(false);

  if (world.icon === null || broken) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Globe className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
      <img
        src={convertFileSrc(world.icon)}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

/**
 * Backups grouped by the world they came from, most recently taken first.
 *
 * A group survives its world: a backup of a world that has been deleted is
 * exactly the thing worth keeping, so it is still listed — and restoring it puts
 * the world back.
 */
function groupBackups(overview: WorldsOverview): BackupGroup[] {
  const groups = new Map<string, WorldBackup[]>();
  for (const backup of overview.backups) {
    const existing = groups.get(backup.world);
    if (existing) existing.push(backup);
    else groups.set(backup.world, [backup]);
  }

  return [...groups.entries()]
    .map(([world, backups]) => ({
      world,
      exists: overview.worlds.some((candidate) => candidate.name === world),
      // The backend already sorts newest first; keep that order inside a group.
      backups,
    }))
    .sort((a, b) => a.world.localeCompare(b.world));
}

interface BackupGroup {
  world: string;
  /** Whether the world is still in the instance. */
  exists: boolean;
  backups: WorldBackup[];
}

/** Open a folder in the OS file manager, complaining if it isn't there. */
async function reveal(path: string) {
  try {
    await system.reveal(path);
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : String(cause));
  }
}
