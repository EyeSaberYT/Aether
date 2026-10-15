/**
 * Subscribes to backend push events for the lifetime of the app:
 *
 * * `download://progress` – download/launch progress snapshots
 * * `auth://device-code`  – the Microsoft device-code prompt during sign-in
 */
import { useEffect } from "react";

import { subscribe } from "@/lib/api";
import type { DeviceCodeInfo, Progress } from "@/lib/tauri";
import { useAccounts } from "@/store/useAccounts";
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
      if (cancelled) {
        progress();
        device();
        return;
      }
      unlisten.push(progress, device);
    })();

    return () => {
      cancelled = true;
      unlisten.forEach((off) => off());
    };
  }, [setProgress, setDeviceCode]);
}
