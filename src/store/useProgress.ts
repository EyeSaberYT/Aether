/**
 * Live download/launch progress and the set of running instances.
 *
 * The backend emits `download://progress` snapshots during every long-running
 * operation; this store keeps the most recent one so the footer and any modal
 * can render a progress bar without re-subscribing.
 */
import { create } from "zustand";

import { launch } from "@/lib/api";
import type { Progress } from "@/lib/tauri";

interface ProgressState {
  progress: Progress | null;
  running: string[];
  setProgress: (progress: Progress | null) => void;
  clearProgress: () => void;
  refreshRunning: () => Promise<void>;
  markStopped: (id: string) => Promise<void>;
}

export const useProgress = create<ProgressState>((set) => ({
  progress: null,
  running: [],

  setProgress: (progress) => set({ progress }),
  clearProgress: () => set({ progress: null }),

  refreshRunning: async () => {
    try {
      const running = await launch.running();
      set({ running });
    } catch {
      // Backend may not be ready yet; ignore.
    }
  },

  markStopped: async (id) => {
    await launch.markStopped(id);
    set((state) => ({ running: state.running.filter((entry) => entry !== id) }));
  },
}));
