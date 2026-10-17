/**
 * Shared state for Aether's self-updater.
 *
 * A single store keeps the startup check and the Settings page in sync: if the
 * silent check on launch already found an update, opening Settings shows it
 * immediately instead of re-checking.
 */
import { create } from "zustand";

import { updater, type UpdateProgress } from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

/** Where the update flow currently stands. */
export type UpdateStatus =
  /** Never checked (or a check reset the flow). */
  | "idle"
  /** A version check is in flight. */
  | "checking"
  /** The running version is the newest published one. */
  | "up-to-date"
  /** An update exists but nothing has been downloaded yet. */
  | "available"
  /** The update is downloading / installing. */
  | "downloading"
  /** Installed; the app just needs to restart into it. */
  | "installed"
  /** The last check or install failed. */
  | "error";

interface UpdaterState {
  status: UpdateStatus;
  /** The pending update, when one was found. */
  update: Update | null;
  /**
   * How the pending update was discovered. The startup check uses this to
   * offer a one-click install via a toast; manual checks in Settings render
   * their result inline instead of prompting.
   */
  discoveredBy: "startup" | "manual" | null;
  /** Download progress, while `status === "downloading"`. */
  progress: UpdateProgress | null;
  /** Human-readable message for `status === "error"`. */
  error: string | null;
  /** Check for a newer version. `silent` swallows errors (startup usage). */
  check: (options?: { silent?: boolean }) => Promise<void>;
  /** Download and install the pending update. */
  install: () => Promise<void>;
  /** Restart into the installed version. */
  relaunch: () => Promise<void>;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: "idle",
  update: null,
  discoveredBy: null,
  progress: null,
  error: null,

  check: async (options) => {
    set({ status: "checking", error: null });
    try {
      const update = await updater.check();
      if (update) {
        set({
          status: "available",
          update,
          discoveredBy: options?.silent ? "startup" : "manual",
        });
      } else {
        set({ status: "up-to-date", update: null, discoveredBy: null });
      }
    } catch (error) {
      if (options?.silent) {
        // The startup check must never nag: reset quietly and move on.
        set({ status: "idle", update: null, discoveredBy: null });
      } else {
        set({ status: "error", error: String(error) });
      }
    }
  },

  install: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: "downloading", progress: { downloaded: 0, total: null }, error: null });
    try {
      await updater.install(update, (progress) => set({ progress }));
      set({ status: "installed", progress: null });
    } catch (error) {
      set({ status: "error", error: String(error), progress: null });
    }
  },

  relaunch: async () => {
    await updater.relaunch();
  },
}));
