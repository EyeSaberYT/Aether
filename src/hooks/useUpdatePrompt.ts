/**
 * Startup self-update flow.
 *
 * Silently checks GitHub Releases a few seconds after launch and, when a newer
 * Aether is published, offers a one-click install through a toast. Download
 * progress and the final "restart to finish" prompt live here too, so the flow
 * completes no matter which screen the user is on.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { formatBytes } from "@/lib/format";
import { useUpdater } from "@/store/useUpdater";

/** Delay before the startup check so it doesn't compete with initial loading. */
const STARTUP_CHECK_DELAY_MS = 3_000;

/** Minimum spacing between progress refreshes when the total size is unknown. */
const UNKNOWN_TOTAL_THROTTLE_MS = 500;

export function useUpdatePrompt() {
  const promptedRef = useRef(false);
  const lastPercentRef = useRef(-1);
  const lastTickRef = useRef(0);

  // Kick off the silent check shortly after launch.
  useEffect(() => {
    const timer = setTimeout(() => {
      void useUpdater.getState().check({ silent: true });
    }, STARTUP_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // React to updater state transitions.
  useEffect(() => {
    return useUpdater.subscribe((state, previous) => {
      // Found during the startup check: offer a one-click install, once.
      if (
        state.status === "available" &&
        previous.status === "checking" &&
        state.discoveredBy === "startup" &&
        state.update &&
        !promptedRef.current
      ) {
        promptedRef.current = true;
        const id = toast.info(`Aether ${state.update.version} is available`, {
          description: `You're running ${state.update.currentVersion}.`,
          duration: 0,
          action: {
            label: "Update",
            onClick: () => {
              toast.dismiss(id);
              void useUpdater.getState().install();
            },
          },
        });
        return;
      }

      // Downloading: a single loading toast with live byte progress.
      if (state.status === "downloading") {
        const { downloaded, total } = state.progress ?? { downloaded: 0, total: null };
        const percent = total ? Math.floor((downloaded / total) * 100) : null;
        // Re-rendering the toast on every chunk is wasteful: refresh only when
        // the visible percentage moves, or on a timer when no total is known.
        if (percent !== null) {
          if (percent === lastPercentRef.current) return;
          lastPercentRef.current = percent;
        } else if (Date.now() - lastTickRef.current < UNKNOWN_TOTAL_THROTTLE_MS) {
          return;
        } else {
          lastTickRef.current = Date.now();
        }
        const detail = total
          ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
          : `${formatBytes(downloaded)} downloaded`;
        toast.loading(`Downloading Aether ${state.update?.version ?? ""}…`, {
          id: "aether-update",
          description: detail,
        });
        return;
      }

      // Installed: prompt for the restart that loads the new build.
      if (state.status === "installed" && previous.status === "downloading") {
        toast.success(`Aether ${state.update?.version ?? "the update"} installed`, {
          id: "aether-update",
          description: "Restart Aether to finish the update.",
          duration: 0,
          action: {
            label: "Restart",
            onClick: () => void useUpdater.getState().relaunch(),
          },
        });
        return;
      }

      // The download or install failed after leaving the loading toast.
      if (state.status === "error" && previous.status === "downloading") {
        toast.error("The update couldn't be installed", {
          id: "aether-update",
          description: state.error,
        });
      }
    });
  }, []);
}
