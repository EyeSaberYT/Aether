/**
 * Typed wrapper around Aether's self-updater (Tauri's official updater plugin).
 *
 * The Rust core fetches `latest.json` from the endpoints configured in
 * `src-tauri/tauri.conf.json` (GitHub Releases of this repository), verifies
 * the bundle against the embedded public key, downloads and installs it.
 * These helpers keep components free of raw plugin imports.
 */
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** Progress of an in-flight update download, in bytes. */
export interface UpdateProgress {
  /** Bytes received so far. */
  downloaded: number;
  /** Total size announced by the server, if known. */
  total: number | null;
}

/** Download progress callback invoked as chunks arrive. */
export type UpdateProgressListener = (progress: UpdateProgress) => void;

export const updater = {
  /**
   * Ask the configured endpoints for a newer version.
   *
   * Resolves to `null` when the running version is already the latest, and
   * rejects when the check could not be performed (offline, endpoint down,
   * malformed manifest).
   */
  async check(): Promise<Update | null> {
    return check();
  },

  /**
   * Download the update (reporting byte progress) and install it.
   *
   * On Windows the signed NSIS installer runs in passive mode; on macOS and
   * Linux the new binaries are swapped in place and take effect on relaunch.
   */
  async install(update: Update, onProgress?: UpdateProgressListener): Promise<void> {
    let total: number | null = null;
    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        // Only the "Started" event carries the overall size; progress events
        // carry the size of each chunk, which we accumulate here.
        total = event.data.contentLength ?? null;
        downloaded = 0;
        onProgress?.({ downloaded, total });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
      }
    });
  },

  /** Restart the app, picking up the freshly installed version. */
  async relaunch(): Promise<void> {
    await relaunch();
  },
};
