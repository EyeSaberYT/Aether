import { useEffect, useMemo, useState } from "react";
import { Download, PackagePlus } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { modrinth } from "@/lib/api";
import { loaderLabel, projectTypeLabel, relativeTime } from "@/lib/format";
import type { ModrinthProject, ModrinthVersion } from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";

interface InstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ModrinthProject;
}

/**
 * Installs a Modrinth project. Modpacks create a new instance; everything else
 * is dropped into a chosen instance (with required dependencies).
 */
export function InstallDialog({ open, onOpenChange, project }: InstallDialogProps) {
  const isModpack = project.projectType === "modpack";

  const instances = useInstances((state) => state.instances);
  const refresh = useInstances((state) => state.refresh);

  const [instanceId, setInstanceId] = useState("");
  const [name, setName] = useState(project.title);
  const [versionId, setVersionId] = useState("");
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [busy, setBusy] = useState(false);

  // Default the target instance to the most recently played one.
  useEffect(() => {
    if (open) {
      setName(project.title);
      setVersionId("");
      setInstanceId((current) => current || instances[0]?.id || "");
    }
  }, [open, project.title, instances]);

  const selected = useMemo(
    () => instances.find((entry) => entry.id === instanceId) ?? null,
    [instances, instanceId],
  );

  // Load candidate versions, filtered by the chosen instance where relevant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingVersions(true);
    const gameVersion = isModpack ? undefined : selected?.gameVersion;
    const loader = isModpack ? undefined : selected?.loader;
    modrinth
      .versions(project.id, gameVersion, loader)
      .then((list) => !cancelled && setVersions(list))
      .catch(() => !cancelled && setVersions([]))
      .finally(() => !cancelled && setLoadingVersions(false));
    return () => {
      cancelled = true;
    };
  }, [open, project.id, isModpack, selected?.gameVersion, selected?.loader]);

  async function handleInstall() {
    setBusy(true);
    try {
      if (isModpack) {
        const instance = await modrinth.installModpack(
          project.id,
          versionId || undefined,
          name.trim() || project.title,
        );
        await refresh();
        toast.success(`Installed “${instance.name}”`);
      } else {
        if (!instanceId) {
          toast.error("Create or select an instance first.");
          return;
        }
        await modrinth.install(instanceId, project.id, versionId || undefined);
        await refresh();
        toast.success(`Installed ${project.title}`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Install {projectTypeLabel(project.projectType).toLowerCase()}
          </DialogTitle>
          <DialogDescription>{project.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isModpack ? (
            <div className="space-y-2">
              <Label htmlFor="pack-name">Instance name</Label>
              <Input
                id="pack-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The pack creates its own instance with the correct loader and version.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Install into</Label>
              {instances.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  You don't have any instances yet. Create one from the Library first.
                </p>
              ) : (
                <Select value={instanceId} onValueChange={setInstanceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an instance" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name} · {entry.gameVersion} · {loaderLabel(entry.loader)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Version</Label>
            <Select value={versionId} onValueChange={setVersionId} disabled={loadingVersions}>
              <SelectTrigger>
                <SelectValue placeholder={loadingVersions ? "Loading…" : "Latest compatible"} />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.versionNumber || version.name}
                    {version.datePublished ? ` · ${relativeTime(version.datePublished)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingVersions && versions.length === 0 && (
              <p className="text-xs text-destructive">
                No compatible version found for this instance.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            disabled={busy || (!isModpack && !instanceId) || versions.length === 0}
            onClick={handleInstall}
          >
            {busy ? <Spinner /> : isModpack ? <PackagePlus /> : <Download />}
            {isModpack ? "Create instance" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
