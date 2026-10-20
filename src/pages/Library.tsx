import { useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Download,
  FolderInput,
  LibraryBig,
  PackagePlus,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CARD_GRID,
  DEFAULT_VIEW,
  VIEW_KEY,
  ViewToggle,
  asViewMode,
  type ViewMode,
} from "@/components/common/ViewToggle";
import { ImportLauncherDialog } from "@/components/instances/ImportLauncherDialog";
import { ImportModpackDialog } from "@/components/instances/ImportModpackDialog";
import { InstanceCard, InstanceRow } from "@/components/instances/InstanceCard";
import { NewInstanceDialog } from "@/components/instances/NewInstanceDialog";
import { ScanDialog } from "@/components/instances/ScanDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLaunchInstance } from "@/hooks/useLaunchInstance";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { InstanceSummary } from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";

/** Instance collection. Creation, import and scanning continue to use their existing flows. */
export function Library() {
  const instances = useInstances((state) => state.instances);
  const loading = useInstances((state) => state.loading);
  const loaded = useInstances((state) => state.loaded);
  const running = useProgress((state) => state.running);
  const { launchingId, launch } = useLaunchInstance();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [launcherImportOpen, setLauncherImportOpen] = useState(false);
  const [packImportOpen, setPackImportOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<InstanceSummary | null>(null);
  const [storedView, setStoredView] = usePersistentState<ViewMode>(VIEW_KEY, DEFAULT_VIEW);
  const view = asViewMode(storedView);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return instances;
    return instances.filter((instance) =>
      [instance.name, instance.gameVersion, instance.loader].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [instances, query]);

  const runningCount = instances.filter((instance) => running.includes(instance.id)).length;
  const modCount = instances.reduce((sum, instance) => sum + instance.modCount, 0);

  return (
    <div className="screen-page">
      <PageHeader
        title="Instances"
        description="Every Minecraft setup, organized and ready to launch."
        actions={
          <>
            <ViewToggle view={view} onChange={setStoredView} label="Instance layout" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Import
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setLauncherImportOpen(true)}>
                  <FolderInput /> From another launcher
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPackImportOpen(true)}>
                  <PackagePlus /> Modpack file (.mrpack / .zip)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="brand" onClick={() => setCreateOpen(true)}>
              <Plus /> New instance
            </Button>
          </>
        }
      />

      <section className="mt-8 grid grid-cols-3 gap-3">
        <CollectionMetric icon={Boxes} label="My instances" value={instances.length} />
        <CollectionMetric icon={PackagePlus} label="Mods installed" value={modCount} />
        <CollectionMetric
          icon={Activity}
          label="Currently running"
          value={runningCount}
          live={runningCount > 0}
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border/80 bg-card/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find an instance by name, version or loader"
              className="bg-background pl-9"
            />
          </div>
          <span className="px-2 text-xs text-muted-foreground">
            {query
              ? `${filtered.length} results`
              : `${instances.length} ${instances.length === 1 ? "instance" : "instances"}`}
          </span>
        </div>

        <div className="p-4">
          {loading && !loaded ? (
            <div className={CARD_GRID}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={LibraryBig}
              title={query ? "No matching instances" : "Your library is empty"}
              description={
                query
                  ? "Try another name, game version or loader."
                  : "Create an instance, import an existing setup, or start with a modpack."
              }
              action={
                !query ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="brand" onClick={() => setCreateOpen(true)}>
                      <Plus /> New instance
                    </Button>
                    <Button variant="outline" onClick={() => setPackImportOpen(true)}>
                      <PackagePlus /> Import modpack
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : view === "list" ? (
            <div className="flex flex-col gap-2">
              {filtered.map((instance) => (
                <InstanceRow
                  key={instance.id}
                  instance={instance}
                  running={running.includes(instance.id)}
                  launching={launchingId === instance.id}
                  onPlay={() => void launch(instance.id)}
                  onScan={setScanTarget}
                />
              ))}
            </div>
          ) : (
            <div className={CARD_GRID}>
              {filtered.map((instance) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  running={running.includes(instance.id)}
                  launching={launchingId === instance.id}
                  onPlay={() => void launch(instance.id)}
                  onScan={setScanTarget}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <NewInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportLauncherDialog open={launcherImportOpen} onOpenChange={setLauncherImportOpen} />
      <ImportModpackDialog open={packImportOpen} onOpenChange={setPackImportOpen} />
      <ScanDialog
        open={scanTarget !== null}
        onOpenChange={(open) => {
          if (!open) setScanTarget(null);
        }}
        instanceId={scanTarget?.id ?? ""}
        instanceName={scanTarget?.name ?? ""}
      />
    </div>
  );
}

function CollectionMetric({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <div className="metric-card flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <small className="block truncate text-[11px] text-muted-foreground">{label}</small>
        <strong className="text-lg font-bold tabular-nums">{value.toLocaleString()}</strong>
      </span>
    </div>
  );
}
