import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Boxes,
  Copy,
  Eraser,
  FileText,
  FolderOpen,
  Package,
  Play,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  SquarePen,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Spinner } from "@/components/common/Spinner";
import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { InstanceUpdates } from "@/components/instances/InstanceUpdates";
import { ScanDialog } from "@/components/instances/ScanDialog";
import { ServerListTab } from "@/components/instances/ServerListTab";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useFileDrop } from "@/hooks/useFileDrop";
import { useLaunchInstance } from "@/hooks/useLaunchInstance";
import { instances as instancesApi, launch as launchApi, modpacks, system } from "@/lib/api";
import { pickDirectory, pickSavePath } from "@/lib/dialogs";
import { formatBytes, formatDuration, loaderColor, loaderLabel, relativeTime } from "@/lib/format";
import type { ContentEntry, Instance, QuickPlay } from "@/lib/tauri";
import { useConsole } from "@/store/useConsole";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";
import { cn } from "@/lib/utils";

/** Full instance view: overview, content, servers, settings and logs. */
export function InstanceDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const refreshList = useInstances((state) => state.refresh);
  const running = useProgress((state) => state.running);
  const { launchingId, launch } = useLaunchInstance();

  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState("overview");
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInstance(await instancesApi.get(id));
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const reveal = useCallback(async () => {
    try {
      const paths = await instancesApi.paths(id);
      await system.reveal(paths.game);
    } catch (cause) {
      toast.error(String(cause));
    }
  }, [id]);

  async function handleExport() {
    if (!instance) return;
    const target = await pickSavePath({
      title: "Export instance as .mrpack",
      defaultPath: `${instance.name}.mrpack`,
      extensions: ["mrpack"],
    });
    if (!target) return;
    const toastId = toast.loading("Exporting modpack…");
    try {
      await modpacks.export(instance.id, target);
      toast.success("Modpack exported", { id: toastId });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause), { id: toastId });
    }
  }

  async function handleDuplicate() {
    if (!instance) return;
    const toastId = toast.loading("Duplicating instance…");
    try {
      const copy = await instancesApi.duplicate(instance.id);
      await refreshList();
      toast.success(`Duplicated as “${copy.name}”`, { id: toastId });
      navigate(`/library/${copy.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause), { id: toastId });
    }
  }

  async function handleDelete() {
    if (!instance) return;
    try {
      await instancesApi.remove(instance.id, true);
      await refreshList();
      toast.success("Instance deleted");
      navigate("/library");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-8 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-5">
          <Skeleton className="h-20 w-20 rounded-xl" />
          <div className="flex-1 space-y-3 py-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        <Button variant="ghost" className="mb-4" onClick={() => navigate("/library")}>
          <ArrowLeft /> Library
        </Button>
        <ErrorState title="Couldn't open this instance" error={error ?? "Not found"} onRetry={load} />
      </div>
    );
  }

  const isRunning = running.includes(instance.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        onClick={() => navigate("/library")}
      >
        <ArrowLeft /> Library
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <InstanceIcon
          icon={instance.icon}
          name={instance.name}
          id={instance.id}
          className="h-20 w-20 text-xl"
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{instance.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {instance.gameVersion}
            </Badge>
            <Badge variant="outline" className={cn(loaderColor(instance.loader))}>
              {loaderLabel(instance.loader)}
              {instance.loaderVersion ? ` ${instance.loaderVersion}` : ""}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Played {relativeTime(instance.lastPlayed)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="brand"
            size="lg"
            disabled={launchingId === instance.id || isRunning}
            onClick={() => void launch(instance.id)}
          >
            {launchingId === instance.id ? <Spinner /> : <Play className="fill-current" />}
            {isRunning ? "Running" : "Play"}
          </Button>

          <Button variant="outline" title="Scan mods and packs" onClick={() => setScanOpen(true)}>
            <ShieldCheck /> Scan
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="More">
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <SquarePen /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleDuplicate()}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport()}>
                <Upload /> Export modpack
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void reveal()}>
                <FolderOpen /> Open folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <InstanceUpdates instanceId={instance.id} />

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">
            <Boxes className="mr-2 h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="content">
            <Package className="mr-2 h-4 w-4" /> Content
          </TabsTrigger>
          <TabsTrigger value="servers">
            <Server className="mr-2 h-4 w-4" /> Servers
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="mr-2 h-4 w-4" /> Settings
          </TabsTrigger>
          <TabsTrigger value="console">
            <Terminal className="mr-2 h-4 w-4" /> Console
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab instance={instance} onReveal={reveal} isRunning={isRunning} />
        </TabsContent>
        <TabsContent value="content">
          <ContentTab instanceId={instance.id} />
        </TabsContent>
        <TabsContent value="servers">
          <ServerListTab
            instanceId={instance.id}
            isRunning={isRunning}
            launching={launchingId === instance.id}
            onJoin={(address) => void launch(instance.id, { type: "multiplayer", address })}
            onReveal={reveal}
          />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab
            instance={instance}
            onSaved={(next) => {
              setInstance(next);
              void refreshList();
            }}
          />
        </TabsContent>
        <TabsContent value="console">
          <ConsoleTab instanceId={instance.id} isRunning={isRunning} />
        </TabsContent>
      </Tabs>

      {/* Rename dialog */}
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        instance={instance}
        onRenamed={setInstance}
      />

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{instance.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the instance and all of its worlds, mods and
              settings. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan dialog */}
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        instanceId={instance.id}
        instanceName={instance.name}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  instance,
  onReveal,
  isRunning,
}: {
  instance: Instance;
  onReveal: () => void;
  isRunning: boolean;
}) {
  // Pack records describe where files came from, not mods in their own right.
  const modCount = instance.installedProjects.filter((p) => p.projectType !== "modpack").length;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Details</h3>
        <Separator className="my-3" />
        <dl className="space-y-2.5 text-sm">
          <Row label="Minecraft" value={instance.gameVersion} />
          <Row label="Loader" value={loaderLabel(instance.loader)} />
          <Row label="Loader build" value={instance.loaderVersion ?? "—"} />
          <Row label="Mods installed" value={`${modCount}`} />
          <Row label="Created" value={relativeTime(instance.created)} />
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Activity</h3>
        <Separator className="my-3" />
        <dl className="space-y-2.5 text-sm">
          <Row label="Last played" value={relativeTime(instance.lastPlayed)} />
          <Row label="Play time" value={formatDuration(instance.playTimeSecs)} />
          <Row label="Status" value={isRunning ? "Running" : "Idle"} />
          <Row
            label="Memory"
            value={`${instance.settings.memoryMin}–${instance.settings.memoryMax} MB`}
          />
        </dl>
      </Card>

      {instance.notes && (
        <Card className="p-5 sm:col-span-2">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {instance.notes}
          </p>
        </Card>
      )}

      <Card className="flex items-center justify-between p-5 sm:col-span-2">
        <div>
          <h3 className="text-sm font-semibold">Game files</h3>
          <p className="text-xs text-muted-foreground">
            Open the .minecraft folder to add files manually.
          </p>
        </div>
        <Button variant="outline" onClick={onReveal}>
          <FolderOpen /> Open folder
        </Button>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CONTENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "mod", label: "Mods" },
  { value: "resourcepack", label: "Resource packs" },
  { value: "shader", label: "Shaders" },
  { value: "datapack", label: "Datapacks" },
];

function ContentTab({ instanceId }: { instanceId: string }) {
  const contentMap = useInstances((state) => state.content);
  const loadContent = useInstances((state) => state.loadContent);
  const toggleContent = useInstances((state) => state.toggleContent);
  const deleteContent = useInstances((state) => state.deleteContent);
  const importFiles = useInstances((state) => state.importFiles);

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const entries = contentMap[instanceId];

  useEffect(() => {
    void loadContent(instanceId).catch((error) => toast.error(String(error)));
  }, [instanceId, loadContent]);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      const files = paths.filter((path) => /\.(jar|zip)$/i.test(path));
      if (files.length === 0) return;
      setBusy(true);
      try {
        const count = await importFiles(instanceId, files);
        toast.success(`Added ${count} file${count === 1 ? "" : "s"}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [importFiles, instanceId],
  );

  useFileDrop(handleDrop);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const term = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.kind !== filter) return false;
      if (!term) return true;
      return (
        (entry.title ?? entry.name).toLowerCase().includes(term) ||
        entry.name.toLowerCase().includes(term)
      );
    });
  }, [entries, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search installed content…"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === option.value
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
        {busy ? "Importing…" : "Drag and drop .jar or .zip files here to install them"}
      </div>

      {!entries ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No content installed"
          description="Install mods from Discover, or drag files into this window."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <ContentRow
              key={entry.path}
              entry={entry}
              onToggle={(enabled) => void toggleContent(instanceId, entry.path, enabled)}
              onDelete={() => void deleteContent(instanceId, entry.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContentRow({
  entry,
  onToggle,
  onDelete,
}: {
  entry: ContentEntry;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const label = entry.title ?? entry.name.replace(/\.disabled$/, "");
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {entry.iconUrl ? (
          <img src={entry.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Package className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", !entry.enabled && "text-muted-foreground")}>
          {label}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.kind} · {formatBytes(entry.size)}
          {entry.projectId ? "" : " · local file"}
        </p>
      </div>

      <Switch checked={entry.enabled} onCheckedChange={onToggle} />
      <Button variant="ghost" size="icon-sm" title="Remove" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsTab({
  instance,
  onSaved,
}: {
  instance: Instance;
  onSaved: (instance: Instance) => void;
}) {
  const update = useInstances((state) => state.update);
  const [draft, setDraft] = useState<Instance>(instance);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(instance), [instance]);

  function patchSettings(patch: Partial<Instance["settings"]>) {
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await update(draft);
      onSaved(saved);
      toast.success("Instance settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const quickPlay = draft.settings.quickPlay;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold">General</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field label="Icon (emoji or short text)">
            <Input
              value={draft.icon ?? ""}
              placeholder="🌲"
              onChange={(event) => setDraft({ ...draft, icon: event.target.value || null })}
            />
          </Field>
          <Field label="Group">
            <Input
              value={draft.group ?? ""}
              placeholder="Optional"
              onChange={(event) => setDraft({ ...draft, group: event.target.value || null })}
            />
          </Field>
          <Field label="Notes">
            <Input
              value={draft.notes ?? ""}
              placeholder="Optional"
              onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Java &amp; memory</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Minimum memory (MB)">
            <Input
              type="number"
              value={draft.settings.memoryMin}
              onChange={(event) => patchSettings({ memoryMin: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field label="Maximum memory (MB)">
            <Input
              type="number"
              value={draft.settings.memoryMax}
              onChange={(event) => patchSettings({ memoryMax: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field label="Java path (blank = auto)" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                value={draft.settings.javaPath ?? ""}
                placeholder="Auto-detect"
                onChange={(event) => patchSettings({ javaPath: event.target.value || null })}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  const path = await pickDirectory("Select a Java runtime folder");
                  if (path) patchSettings({ javaPath: path });
                }}
              >
                Browse
              </Button>
            </div>
          </Field>
          <Field label="JVM arguments (one per line)" className="sm:col-span-2">
            <Textarea
              rows={4}
              value={draft.settings.jvmArgs.join("\n")}
              onChange={(event) =>
                patchSettings({ jvmArgs: splitLines(event.target.value) })
              }
            />
          </Field>
          <Field label="Game arguments (one per line)" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={draft.settings.gameArgs.join("\n")}
              onChange={(event) =>
                patchSettings({ gameArgs: splitLines(event.target.value) })
              }
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Display &amp; Quick Play</h3>
        <Separator className="my-3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Width">
            <Input
              type="number"
              value={draft.settings.width}
              onChange={(event) => patchSettings({ width: Number(event.target.value) || 854 })}
            />
          </Field>
          <Field label="Height">
            <Input
              type="number"
              value={draft.settings.height}
              onChange={(event) => patchSettings({ height: Number(event.target.value) || 480 })}
            />
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <span className="text-sm">Launch in fullscreen</span>
            <Switch
              checked={draft.settings.fullscreen}
              onCheckedChange={(checked) => patchSettings({ fullscreen: checked })}
            />
          </label>

          <Field label="Quick Play" className="sm:col-span-2">
            <QuickPlayEditor value={quickPlay} onChange={(next) => patchSettings({ quickPlay: next })} />
          </Field>

          <Field label="Game directory (blank = default)" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                value={draft.settings.gameDir ?? ""}
                placeholder="Default"
                onChange={(event) => patchSettings({ gameDir: event.target.value || null })}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  const path = await pickDirectory("Select a game directory");
                  if (path) patchSettings({ gameDir: path });
                }}
              >
                Browse
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="brand" disabled={saving} onClick={handleSave}>
          {saving ? <Spinner /> : <Save />} Save changes
        </Button>
      </div>
    </div>
  );
}

/** The quick-play targets, in the order they are offered. */
const QUICK_PLAY_OPTIONS = [
  { tag: "none", label: "Title screen" },
  { tag: "multiplayer", label: "Multiplayer" },
  { tag: "singleplayer", label: "Singleplayer" },
  { tag: "singleplayerContinue", label: "Continue" },
] as const;

/** A blank target of the given kind, ready for the field beside it. */
function quickPlayFor(tag: QuickPlay["type"]): QuickPlay {
  switch (tag) {
    case "multiplayer":
      return { type: tag, address: "" };
    case "singleplayer":
      return { type: tag, world: "" };
    default:
      return { type: tag };
  }
}

/**
 * Where the game should open.
 *
 * The tags are the backend's own variant names and must stay lowercase
 * camelCase — serde rejects anything else, which takes the whole settings save
 * down with it, and the chips would never show as selected either.
 */
function QuickPlayEditor({
  value,
  onChange,
}: {
  value: QuickPlay;
  onChange: (value: QuickPlay) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_PLAY_OPTIONS.map((option) => (
          <button
            key={option.tag}
            onClick={() => onChange(quickPlayFor(option.tag))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              value.type === option.tag
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value.type === "multiplayer" && (
        <Input
          value={value.address ?? ""}
          placeholder="play.example.com"
          onChange={(event) => onChange({ type: "multiplayer", address: event.target.value })}
        />
      )}
      {value.type === "singleplayer" && (
        <Input
          value={value.world ?? ""}
          placeholder="World folder name"
          onChange={(event) => onChange({ type: "singleplayer", world: event.target.value })}
        />
      )}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

/** Distance from the bottom, in pixels, that still counts as "following". */
const FOLLOW_THRESHOLD = 24;

/**
 * Live console for an instance.
 *
 * Lines arrive from the backend over `game://output` the moment the game prints
 * them, so the view fills in as it runs. When there is nothing live yet the last
 * launch log is loaded instead, which keeps the output around after a crash.
 */
function ConsoleTab({ instanceId, isRunning }: { instanceId: string; isRunning: boolean }) {
  const lines = useConsole((state) => state.lines[instanceId]);
  const replace = useConsole((state) => state.replace);
  const clear = useConsole((state) => state.clear);

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [follow, setFollow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const seeded = useRef<string | null>(null);

  // Seed once per instance, and only when nothing has been streamed yet.
  useEffect(() => {
    if (seeded.current === instanceId) return;
    seeded.current = instanceId;
    if ((useConsole.getState().lines[instanceId]?.length ?? 0) > 0) return;

    let cancelled = false;
    void (async () => {
      setLoadingHistory(true);
      try {
        const log = await launchApi.logs(instanceId, 500);
        if (!cancelled && log) {
          replace(
            instanceId,
            log.split(/\r?\n/).filter((line) => line.length > 0),
          );
        }
      } catch {
        // A first launch has no log yet; an empty console is the right answer.
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instanceId, replace]);

  // Keep the newest output in view, unless the user scrolled up to read back.
  useEffect(() => {
    if (!follow) return;
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, follow]);

  function handleScroll() {
    const element = viewport.current;
    if (!element) return;
    const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollow(fromBottom < FOLLOW_THRESHOLD);
  }

  const empty = (lines?.length ?? 0) === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {isRunning ? "Live output from the running game" : "Most recent launch output"}
          </p>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!follow && !empty && (
            <Button variant="ghost" size="sm" onClick={() => setFollow(true)}>
              Jump to end
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={empty} onClick={() => clear(instanceId)}>
            <Eraser /> Clear
          </Button>
        </div>
      </div>

      {loadingHistory && empty ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : empty ? (
        <EmptyState
          icon={FileText}
          title="Nothing here yet"
          description="Launch the game and everything it prints will stream in live."
        />
      ) : (
        <div
          ref={viewport}
          onScroll={handleScroll}
          className="max-h-[32rem] min-h-[16rem] overflow-auto rounded-xl border bg-black/60 p-4 font-mono text-xs leading-relaxed"
        >
          {lines?.map((line) => (
            <div
              key={line.id}
              className={cn(
                "whitespace-pre-wrap break-words",
                line.stream === "stderr" ? "text-red-300/90" : "text-zinc-300/90",
              )}
            >
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rename dialog
// ---------------------------------------------------------------------------

function RenameDialog({
  open,
  onOpenChange,
  instance,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  onRenamed: (instance: Instance) => void;
}) {
  const [name, setName] = useState(instance.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(instance.name);
  }, [open, instance.name]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const updated = await instancesApi.rename(instance.id, name.trim());
      onRenamed(updated);
      useInstances.getState().refresh();
      toast.success("Renamed");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename instance</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void submit()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy && <Spinner />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
