/**
 * Shared "play this instance" behaviour used by the Home, Library and instance
 * detail screens.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { launch as launchApi } from "@/lib/api";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";

export function useLaunchInstance() {
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const refreshRunning = useProgress((state) => state.refreshRunning);
  const refreshInstances = useInstances((state) => state.refresh);

  const launch = useCallback(
    async (id: string) => {
      setLaunchingId(id);
      try {
        const process = await launchApi.instance(id);
        toast.success("Minecraft is starting…", {
          description: `Process ${process.pid}`,
        });
        await refreshRunning();
        await refreshInstances();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setLaunchingId(null);
      }
    },
    [refreshRunning, refreshInstances],
  );

  return { launchingId, launch };
}
