import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { modrinth } from "@/lib/api";
import type { UpdateInfo } from "@/lib/tauri";
import { useInstances } from "@/store/useInstances";

/**
 * Banner that checks Modrinth for newer versions of the projects installed in
 * an instance and offers to apply them in one go.
 */
export function InstanceUpdates({ instanceId }: { instanceId: string }) {
  const [updates, setUpdates] = useState<UpdateInfo[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const loadContent = useInstances((state) => state.loadContent);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setUpdates(await modrinth.checkUpdates(instanceId));
    } catch {
      // Offline or rate-limited — stay quiet and hide the banner.
      setUpdates(null);
    } finally {
      setChecking(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void check();
  }, [check]);

  if (updates === null || updates.length === 0) return null;

  const pending = updates;

  async function applyAll() {
    setApplying(true);
    const toastId = toast.loading(`Updating ${pending.length} project(s)…`);
    try {
      const count = await modrinth.updateAll(instanceId);
      await loadContent(instanceId).catch(() => {});
      toast.success(`Updated ${count} project${count === 1 ? "" : "s"}`, { id: toastId });
      await check();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { id: toastId });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {updates.length} update{updates.length === 1 ? "" : "s"} available
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {updates
            .slice(0, 3)
            .map((update) => update.title)
            .join(", ")}
          {updates.length > 3 ? `, +${updates.length - 3} more` : ""}
        </p>
      </div>
      <Badge variant="muted" className="shrink-0">
        {updates.length}
      </Badge>
      <Button variant="ghost" size="icon-sm" title="Re-check" onClick={() => void check()}>
        {checking ? <Spinner /> : <RefreshCw />}
      </Button>
      <Button variant="brand" disabled={applying} onClick={() => void applyAll()}>
        {applying ? <Spinner /> : <ArrowUpCircle />} Update all
      </Button>
    </div>
  );
}
