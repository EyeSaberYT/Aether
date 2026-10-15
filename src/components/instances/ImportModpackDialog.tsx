import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileArchive, FolderOpen, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
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
import { modpacks } from "@/lib/api";
import { pickFile } from "@/lib/dialogs";
import { formatBytes, loaderLabel } from "@/lib/format";
import type { ModpackPreview } from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";

interface ImportModpackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Import a local `.mrpack`: choose the file, preview it, then create an instance. */
export function ImportModpackDialog({ open, onOpenChange }: ImportModpackDialogProps) {
  const navigate = useNavigate();
  const refreshInstances = useInstances((state) => state.refresh);

  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<ModpackPreview | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPath("");
    setPreview(null);
    setName("");
  }

  async function choose() {
    const chosen = await pickFile({ title: "Choose a Modrinth modpack", extensions: ["mrpack"] });
    if (!chosen) return;
    setLoading(true);
    try {
      const result = await modpacks.preview(chosen);
      setPath(chosen);
      setPreview(result);
      setName(result.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!path) return;
    setBusy(true);
    try {
      const instance = await modpacks.import(path, name.trim() || undefined);
      await refreshInstances();
      toast.success(`Imported “${instance.name}”`);
      onOpenChange(false);
      reset();
      navigate(`/library/${instance.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import a modpack</DialogTitle>
          <DialogDescription>
            Open a <code className="text-xs">.mrpack</code> file from Modrinth or another
            launcher.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <button
            onClick={choose}
            disabled={loading}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            {loading ? <Spinner className="h-6 w-6" /> : <FolderOpen className="h-7 w-7 text-muted-foreground" />}
            <span className="text-sm font-medium">
              {loading ? "Reading pack…" : "Choose a .mrpack file"}
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <FileArchive className="h-8 w-8 shrink-0 text-brand-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{path.split(/[\\/]/).pop()}</p>
                <p className="truncate text-xs text-muted-foreground">{path}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="font-mono">
                {preview.gameVersion}
              </Badge>
              <Badge variant="outline">{loaderLabel(preview.loader)}</Badge>
              <Badge variant="muted">{preview.fileCount} files</Badge>
              <Badge variant="muted">{formatBytes(preview.totalSize)}</Badge>
            </div>

            {preview.summary && (
              <p className="text-sm text-muted-foreground">{preview.summary}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="pack-instance-name">Instance name</Label>
              <Input
                id="pack-instance-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview && (
            <Button variant="brand" disabled={busy} onClick={handleImport}>
              {busy ? <Spinner /> : <PackagePlus />} Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
