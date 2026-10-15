/**
 * Subscribes to backend push events for the lifetime of the app:
 *
 * * `download://progress` – download/launch progress snapshots
 * * `auth://device-code`  – the Microsoft device-code prompt during sign-in
 * * `game://output`       – live lines from a running game
 * * `game://exit`         – a game process stopped, so clear its "running" flag
 */
import { useEffect } from "react";
import { toast } from "sonner";

import { subscribe } from "@/lib/api";
import type { DeviceCodeInfo, GameExit, GameOutput, Progress } from "@/lib/tauri";
import { useAccounts } from "@/store/useAccounts";
import { useConsole } from "@/store/useConsole";
import { useProgress } from "@/store/useProgress";

export function useBackendEvents(): void {
  const setProgress = useProgress((state) => state.setProgress);
  const setDeviceCode = useAccounts((state) => state.setDeviceCode);

  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    void (async () => {
      const progress = await subscribe<Progress>("download://progress", setProgress);
      const device = await subscribe<DeviceCodeInfo>("auth://device-code", setDeviceCode);

      const output = await subscribe<GameOutput>("game://output", (line) =>
        useConsole.getState().append(line),
      );

      const exit = await subscribe<GameExit>("game://exit", (event) => {
        // The backend only tracks "running" until the launcher notices the
        // process is gone, so this is what makes the Play button come back.
        void useProgress.getState().markStopped(event.instanceId);

        if (event.code === 0 || event.code === null) {
          toast.info("Minecraft closed");
        } else {
          toast.error(`Minecraft exited with code ${event.code}`, {
            description: "Open the Console tab to see the last lines it printed.",
          });
        }
      });

      if (cancelled) {
        [progress, device, output, exit].forEach((off) => off());
        return;
      }
      unlisten.push(progress, device, output, exit);
    })();

    return () => {
      cancelled = true;
      unlisten.forEach((off) => off());
    };
  }, [setProgress, setDeviceCode]);
}
