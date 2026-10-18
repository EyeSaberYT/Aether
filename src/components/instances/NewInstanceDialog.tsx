import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { IconPicker } from "@/components/instances/IconPicker";
import { versions as versionsApi } from "@/lib/api";
import { loaderLabel } from "@/lib/format";
import type { LoaderVersion, VersionOption } from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";
import { useSettings } from "@/store/useSettings";

const LOADERS = ["vanilla", "fabric", "quilt", "forge", "neoforge"];

interface NewInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Wizard for creating a fresh, empty instance. */
export function NewInstanceDialog({ open, onOpenChange }: NewInstanceDialogProps) {
  const navigate = useNavigate();
  const showSnapshots = useSettings((state) => state.settings?.showSnapshots ?? false);
  const create = useInstances((state) => state.create);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState("vanilla");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [installLoader, setInstallLoader] = useState(true);

  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingLoader, setLoadingLoader] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time it opens.
  useEffect(() => {
    if (open) {
      setName("");
      setIcon(null);
      setLoader("vanilla");
      setLoaderVersion("");
      setInstallLoader(true);
    }
  }, [open]);

  // Load the Minecraft version list once the dialog is shown.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingVersions(true);
    versionsApi
      .list(showSnapshots)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setGameVersion((current) => current || list[0]?.id || "");
      })
      .catch((error) => toast.error(String(error)))
      .finally(() => !cancelled && setLoadingVersions(false));
    return () => {
      cancelled = true;
    };
  }, [open, showSnapshots]);

  // Fetch the loader build list whenever the loader or game version changes.
  useEffect(() => {
    if (!open || loader === "vanilla" || !gameVersion) {
      setLoaderVersions([]);
      return;
    }
    let cancelled = false;
    setLoadingLoader(true);
    versionsApi
      .loaderVersions(loader, gameVersion)
      .then((list) => {
        if (cancelled) return;
        setLoaderVersions(list);
        setLoaderVersion((current) =>
          list.some((entry) => entry.version === current)
            ? current
            : ((list.find((entry) => entry.stable) ?? list[0])?.version ?? ""),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setLoaderVersions([]);
          toast.error(String(error));
        }
      })
      .finally(() => !cancelled && setLoadingLoader(false));
    return () => {
      cancelled = true;
    };
  }, [open, loader, gameVersion]);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && gameVersion.length > 0 && !submitting,
    [name, gameVersion, submitting],
  );

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const instance = await create({
        name: name.trim(),
        gameVersion,
        loader,
        icon,
        loaderVersion: loader === "vanilla" ? null : loaderVersion || null,
        installLoader: loader !== "vanilla" && installLoader,
      });
      toast.success(`Created “${instance.name}”`);
      onOpenChange(false);
      navigate(`/library/${instance.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New instance</DialogTitle>
          <DialogDescription>
            Pick a Minecraft version and, optionally, a mod loader to install.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instance-name">Name</Label>
            <Input
              id="instance-name"
              value={name}
              placeholder="My survival world"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <IconPicker
              value={icon}
              onChange={setIcon}
              name={name || "New instance"}
              id={name || "new"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minecraft version</Label>
              <Select value={gameVersion} onValueChange={setGameVersion} disabled={loadingVersions}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingVersions ? "Loading…" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.id}
                      {version.latestRelease ? " · latest" : ""}
                      {version.versionType !== "release" ? ` (${version.versionType})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mod loader</Label>
              <Select value={loader} onValueChange={setLoader}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOADERS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {loaderLabel(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loader !== "vanilla" && (
            <>
              <div className="space-y-2">
                <Label>Loader version</Label>
                <Select
                  value={loaderVersion}
                  onValueChange={setLoaderVersion}
                  disabled={loadingLoader || loaderVersions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLoader ? "Loading…" : "Latest compatible"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loaderVersions.map((entry) => (
                      <SelectItem key={entry.version} value={entry.version}>
                        {entry.version}
                        {entry.stable ? " · stable" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">
                  Install the loader now
                  <span className="block text-xs text-muted-foreground">
                    Downloads the {loaderLabel(loader)} profile immediately.
                  </span>
                </span>
                <Switch checked={installLoader} onCheckedChange={setInstallLoader} />
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" disabled={!canSubmit} onClick={handleCreate}>
            {submitting ? <Spinner /> : <Package />} Create instance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
