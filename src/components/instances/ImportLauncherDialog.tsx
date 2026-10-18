import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderInput, PackageOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPicker } from "@/components/instances/IconPicker";
import { importApi, versions as versionsApi } from "@/lib/api";
import { pickDirectory } from "@/lib/dialogs";
import { formatBytes, loaderLabel, relativeTime } from "@/lib/format";
import type {
  ImportCandidate,
  ImportRequest,
  LoaderKind,
  LoaderVersion,
  VersionOption,
} from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";

const LOADERS: LoaderKind[] = ["vanilla", "fabric", "quilt", "forge", "neoforge"];

/** Friendly names for each launcher the scan knows about. */
const SOURCE_LABELS: Record<string, string> = {
  prism: "Prism Launcher",
  multimc: "MultiMC",
  curseforge: "CurseForge",
  modrinth: "Modrinth App",
  minecraft: "Minecraft Launcher",
  folder: "Chosen folder",
};

/** Editable state for one candidate row. */
interface RowState {
  checked: boolean;
  name: string;
  gameVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  /** Emoji, letters, or an absolute image path; `null` means automatic. */
  icon: string | null;
  /** The edit panel is open; rows missing metadata start open. */
  expanded: boolean;
}

/** Minecraft version picker; keeps the candidate's own value even if it is not in the manifest. */
function GameVersionSelect({
  value,
  options,
  onValueChange,
  includeSnapshots,
}: {
  value: string;
  options: VersionOption[];
  onValueChange: (value: string) => void;
  includeSnapshots: boolean;
}) {
  // Always offer the value we already have, so an odd/custom version can't be
  // silently lost just because the manifest doesn't list it.
  const ids = useMemo(() => {
    const list = options.filter((option) => includeSnapshots || option.versionType === "release");
    const ids = new Set(list.map((option) => option.id));
    if (value && !ids.has(value)) ids.add(value);
    return Array.from(ids);
  }, [options, value, includeSnapshots]);

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-[140px]">
        <SelectValue placeholder="Version" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {ids.map((id) => (
          <SelectItem key={id} value={id}>
            {id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Loader build picker; fetches the available builds for the chosen pair. */
function LoaderVersionSelect({
  value,
  loader,
  gameVersion,
  onValueChange,
}: {
  value: string | null;
  loader: LoaderKind;
  gameVersion: string;
  onValueChange: (value: string | null) => void;
}) {
  const [list, setList] = useState<LoaderVersion[]>([]);
  const [loading, setLoading] = useState(false);
  // Keep the latest callback/value in refs so the fetch effect only depends on
  // the loader/version pair (rows re-render on every keystroke otherwise).
  const valueRef = useRef(value);
  const changeRef = useRef(onValueChange);
  valueRef.current = value;
  changeRef.current = onValueChange;

  useEffect(() => {
    if (loader === "vanilla" || !gameVersion) {
      setList([]);
      return;
    }
    let alive = true;
    setLoading(true);
    versionsApi
      .loaderVersions(loader, gameVersion)
      .then((builds) => {
        if (!alive) return;
        setList(builds);
        // Preselect the newest stable build when the source didn't pin one
        // (or pinned one this loader doesn't have).
        const current = valueRef.current;
        if (builds.length > 0 && (!current || !builds.some((build) => build.version === current))) {
          changeRef.current((builds.find((build) => build.stable) ?? builds[0]).version);
        }
      })
      .catch(() => {
        // Falling back to "latest stable" on the backend is fine when the
        // build list can't be fetched.
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loader, gameVersion]);

  if (loader === "vanilla") {
    return (
      <div className="flex h-9 w-[170px] items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
        No loader build
      </div>
    );
  }

  return (
    <Select value={value ?? undefined} onValueChange={(next) => onValueChange(next || null)}>
      <SelectTrigger className="h-9 w-[170px]" disabled={loading}>
        <SelectValue placeholder={loading ? "Loading builds…" : "Loader build"} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {list.map((build) => (
          <SelectItem key={build.version} value={build.version}>
            {build.version}
            {build.stable ? "" : " (beta)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ImportLauncherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Import instances the user already has in another launcher (Prism/MultiMC,
 * CurseForge, the vanilla launcher, the Modrinth App) or in a folder they pick
 * by hand. The scan only reads metadata; nothing is moved until the user
 * confirms, and then Aether copies the files into new instances.
 */
export function ImportLauncherDialog({ open, onOpenChange }: ImportLauncherDialogProps) {
  const refresh = useInstances((state) => state.refresh);
  const progress = useProgress((state) => state.progress);

  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [sourceNotes, setSourceNotes] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [gameVersions, setGameVersions] = useState<VersionOption[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [importing, setImporting] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  /** Merge freshly discovered candidates into the current list + row state. */
  function absorb(found: ImportCandidate[]) {
    setCandidates((current) => {
      const seen = new Set(current.map((candidate) => candidate.id));
      const added = found.filter((candidate) => !seen.has(candidate.id));
      if (added.length === 0) return current;
      setRows((rows) => {
        const next = { ...rows };
        for (const candidate of added) {
          next[candidate.id] = {
            checked: true,
            name: candidate.name,
            gameVersion: candidate.gameVersion ?? "",
            loader: candidate.loader ?? "vanilla",
            loaderVersion: candidate.loaderVersion,
            // Seed from the launcher's own icon, so the preview reflects what
            // the instance will look like unless the user changes it.
            icon: candidate.icon,
            // Metadata holes mean "this row needs a decision" — open it up.
            expanded: !candidate.gameVersion || !candidate.loader,
          };
        }
        return next;
      });
      return [...current, ...added];
    });
  }

  // Scan the machine and load the version list each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setScanning(true);
    importApi
      .scan()
      .then((scan) => {
        if (!alive) return;
        absorb(scan.candidates);
        setSourceNotes(
          scan.sources
            .filter((source) => source.found)
            .map((source) => `${source.label}: ${source.path}`),
        );
      })
      .catch((error) => toast.error(String(error)))
      .finally(() => alive && setScanning(false));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    versionsApi
      .list(true)
      .then((list) => alive && setGameVersions(list))
      .catch(() => {
        // Version list is only needed to *change* a version; candidates keep
        // their own values even if this fails.
      });
    return () => {
      alive = false;
    };
  }, [open]);

  /** Everything the user has ticked, ready to send to the backend. */
  const requests = useMemo(() => {
    const list: ImportRequest[] = [];
    for (const candidate of candidates) {
      const row = rows[candidate.id];
      if (!row?.checked) continue;
      list.push({
        source: candidate.kind,
        name: row.name.trim() || candidate.name,
        path: candidate.path,
        gameVersion: row.gameVersion,
        loader: row.loader,
        loaderVersion: row.loader === "vanilla" ? null : row.loaderVersion,
        // The user's pick wins; it falls back to the launcher's icon, then to
        // an automatic monogram.
        icon: row.icon,
      });
    }
    return list;
  }, [candidates, rows]);

  const missingVersion = requests.some((request) => !request.gameVersion);
  const canImport = requests.length > 0 && !missingVersion && !importing;

  function patch(id: string, patch: Partial<RowState>) {
    setRows((rows) => (rows[id] ? { ...rows, [id]: { ...rows[id], ...patch } } : rows));
  }

  /** Fallback for launchers Aether cannot detect automatically. */
  async function browseFolder() {
    const folder = await pickDirectory("Choose a launcher's data folder or an instance folder");
    if (!folder) return;
    setBrowsing(true);
    try {
      const found = await importApi.inspect(folder);
      if (found.length === 0) {
        toast.error("Nothing importable was found in that folder.");
      } else {
        absorb(found);
        toast.success(`Found ${found.length} importable instance${found.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBrowsing(false);
    }
  }

  async function runImport() {
    if (!canImport) return;
    setImporting(true);
    try {
      const outcome = await importApi.importInstances(requests);
      if (outcome.imported.length > 0) {
        await refresh();
        toast.success(
          `Imported ${outcome.imported.length} instance${outcome.imported.length === 1 ? "" : "s"}.`,
        );
      }
      // Report each failure individually: one broken instance must not hide
      // the ones that succeeded.
      for (const failure of outcome.failed) {
        toast.error(`${failure.name}: ${failure.error}`);
      }
      if (outcome.imported.length > 0 && outcome.failed.length === 0) {
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setImporting(false);
    }
  }

  // Group rows by launcher so the list reads like "Prism, then CurseForge…".
  const groups = useMemo(() => {
    const map = new Map<string, ImportCandidate[]>();
    for (const candidate of candidates) {
      const key = candidate.kind;
      const bucket = map.get(key);
      if (bucket) bucket.push(candidate);
      else map.set(key, [candidate]);
    }
    return Array.from(map.entries());
  }, [candidates]);

  const totalBytes = useMemo(
    () =>
      candidates.reduce(
        (sum, candidate) => (rows[candidate.id]?.checked ? sum + candidate.size : sum),
        0,
      ),
    [candidates, rows],
  );

  const importPercent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : progress?.finished
        ? 100
        : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import from another launcher</DialogTitle>
          <DialogDescription>
            Aether copies the game folders you already have into new instances. Nothing in the
            original launcher is moved, renamed or changed.
          </DialogDescription>
        </DialogHeader>

        {sourceNotes.length > 0 && (
          <div className="space-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {sourceNotes.map((note) => (
              <p key={note} className="truncate">
                {note}
              </p>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[55vh] pr-3">
          {scanning ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
              <PackageOpen className="h-7 w-7 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No instances were detected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a launcher&apos;s data folder (or one instance folder) and Aether will read
                  it from there.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(([kind, group]) => (
                <div key={kind} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {SOURCE_LABELS[kind] ?? group[0].source}
                    </span>
                    <Badge variant="muted">
                      {group.length} instance{group.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  {group.map((candidate) => {
                    const row = rows[candidate.id];
                    if (!row) return null;
                    return (
                      <div
                        key={candidate.id}
                        className="rounded-lg border bg-card p-3"
                        style={{ opacity: row.checked ? 1 : 0.55 }}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={row.checked}
                            onCheckedChange={(next) =>
                              patch(candidate.id, { checked: next === true })
                            }
                            aria-label={`Import ${candidate.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {row.name || candidate.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {row.gameVersion ? (
                                <Badge variant="outline" className="font-mono">
                                  {row.gameVersion}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/50 text-amber-500"
                                >
                                  version needed
                                </Badge>
                              )}
                              <Badge variant="outline">{loaderLabel(row.loader)}</Badge>
                              <span>{candidate.mods} mods</span>
                              <span>·</span>
                              <span>{formatBytes(candidate.size)}</span>
                              {candidate.modified !== null && (
                                <>
                                  <span>·</span>
                                  <span>
                                    changed{" "}
                                    {relativeTime(new Date(candidate.modified).toISOString())}
                                  </span>
                                </>
                              )}
                              {candidate.note && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{candidate.note}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1"
                            onClick={() => patch(candidate.id, { expanded: !row.expanded })}
                          >
                            {row.expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            Edit
                          </Button>
                        </div>

                        {row.expanded && (
                          <>
                            <Separator className="my-3" />
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="space-y-1">
                                <IconPicker
                                  value={row.icon}
                                  name={row.name || candidate.name}
                                  id={candidate.id}
                                  onChange={(next) => patch(candidate.id, { icon: next })}
                                />
                              </div>
                              <div className="space-y-1">
                                <label
                                  className="text-xs text-muted-foreground"
                                  htmlFor={`name-${candidate.id}`}
                                >
                                  Name
                                </label>
                                <Input
                                  id={`name-${candidate.id}`}
                                  className="h-9 w-[200px]"
                                  value={row.name}
                                  onChange={(event) =>
                                    patch(candidate.id, { name: event.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Minecraft</span>
                                <GameVersionSelect
                                  value={row.gameVersion}
                                  options={gameVersions}
                                  includeSnapshots={showSnapshots}
                                  onValueChange={(next) =>
                                    patch(candidate.id, { gameVersion: next })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Loader</span>
                                <Select
                                  value={row.loader}
                                  onValueChange={(next) =>
                                    patch(candidate.id, {
                                      loader: next as LoaderKind,
                                      // A different loader invalidates the build.
                                      loaderVersion: next === "vanilla" ? null : null,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9 w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LOADERS.map((loader) => (
                                      <SelectItem key={loader} value={loader}>
                                        {loaderLabel(loader)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Loader build</span>
                                <LoaderVersionSelect
                                  value={row.loaderVersion}
                                  loader={row.loader}
                                  gameVersion={row.gameVersion}
                                  onValueChange={(next) =>
                                    patch(candidate.id, { loaderVersion: next })
                                  }
                                />
                              </div>
                              {!showSnapshots && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 text-xs"
                                  onClick={() => setShowSnapshots(true)}
                                >
                                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                  Show snapshots
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" disabled={browsing || importing} onClick={browseFolder}>
            {browsing ? (
              <Spinner className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <FolderInput className="mr-1.5 h-3.5 w-3.5" />
            )}
            Browse for a folder…
          </Button>
          <span>
            {requests.length} selected · {formatBytes(totalBytes)}
            {missingVersion ? " · pick a version for every instance" : ""}
          </span>
        </div>

        {importing && progress && !progress.finished && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate">{progress.label}</span>
              <span className="shrink-0 text-muted-foreground">{importPercent}%</span>
            </div>
            <Progress value={importPercent} className="h-1.5" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={importing} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!canImport} onClick={runImport}>
            {importing ? <Spinner /> : <PackageOpen />}
            Import {requests.length} instance{requests.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
