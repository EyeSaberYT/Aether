import { useMemo, useState } from "react";
import { LibraryBig, PackagePlus, Plus, Search } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ImportModpackDialog } from "@/components/instances/ImportModpackDialog";
import { InstanceCard } from "@/components/instances/InstanceCard";
import { NewInstanceDialog } from "@/components/instances/NewInstanceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLaunchInstance } from "@/hooks/useLaunchInstance";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";

/** The instance library: search, create and launch. */
export function Library() {
  const instances = useInstances((state) => state.instances);
  const loading = useInstances((state) => state.loading);
  const loaded = useInstances((state) => state.loaded);
  const running = useProgress((state) => state.running);
  const { launchingId, launch } = useLaunchInstance();

  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return instances;
    return instances.filter(
      (instance) =>
        instance.name.toLowerCase().includes(term) ||
        instance.gameVersion.toLowerCase().includes(term) ||
        instance.loader.toLowerCase().includes(term),
    );
  }, [instances, query]);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <PageHeader
        title="Library"
        description={`${instances.length} ${instances.length === 1 ? "instance" : "instances"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <PackagePlus /> Import pack
            </Button>
            <Button variant="brand" onClick={() => setNewOpen(true)}>
              <Plus /> New instance
            </Button>
          </>
        }
      />

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search instances…"
          className="pl-9"
        />
      </div>

      <div className="mt-6">
        {loading && !loaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={LibraryBig}
            title={query ? "No matches" : "Your library is empty"}
            description={
              query
                ? "Try a different search term."
                : "Create an instance to install mods, loaders and shaders."
            }
            action={
              !query && (
                <Button variant="brand" onClick={() => setNewOpen(true)}>
                  <Plus /> New instance
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                running={running.includes(instance.id)}
                launching={launchingId === instance.id}
                onPlay={() => void launch(instance.id)}
              />
            ))}
          </div>
        )}
      </div>

      <NewInstanceDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportModpackDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
