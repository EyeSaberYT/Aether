import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { ProgressFooter } from "@/components/layout/ProgressFooter";
import { Sidebar } from "@/components/layout/Sidebar";
import { WindowControls } from "@/components/layout/WindowControls";
import { Settings } from "@/pages/Settings";
import { useBackendEvents } from "@/hooks/useBackendEvents";
import { useUpdatePrompt } from "@/hooks/useUpdatePrompt";
import { useAccounts } from "@/store/useAccounts";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";
import { useSettings } from "@/store/useSettings";

/**
 * Top-level application frame: navigation rail on the left, routed content in
 * the middle and the progress footer across the bottom.
 */
export function AppShell() {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useBackendEvents();
  useUpdatePrompt();

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
    <div className="app-frame flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <WindowControls />
      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <section className="flex min-w-0 flex-1 flex-col">
          <main className="launcher-main min-h-0 flex-1 overflow-y-auto">
            <div key={location.pathname} className="page-enter min-h-full">
              <Outlet />
            </div>
          </main>
          <ProgressFooter />
        </section>
      </div>
      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
