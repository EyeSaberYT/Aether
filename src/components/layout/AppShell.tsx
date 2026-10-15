import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { ProgressFooter } from "@/components/layout/ProgressFooter";
import { Sidebar } from "@/components/layout/Sidebar";
import { useBackendEvents } from "@/hooks/useBackendEvents";
import { useAccounts } from "@/store/useAccounts";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";
import { useSettings } from "@/store/useSettings";

/**
 * Top-level application frame: navigation rail on the left, routed content in
 * the middle and the progress footer across the bottom.
 */
export function AppShell() {
  useBackendEvents();

  const loadSettings = useSettings((state) => state.load);
  const refreshAccounts = useAccounts((state) => state.refresh);
  const refreshInstances = useInstances((state) => state.refresh);
  const refreshRunning = useProgress((state) => state.refreshRunning);

  // Prime every store once on startup.
  useEffect(() => {
    void loadSettings();
    void refreshAccounts();
    void refreshInstances();
    void refreshRunning();
  }, [loadSettings, refreshAccounts, refreshInstances, refreshRunning]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <ProgressFooter />
      </div>
    </div>
  );
}
