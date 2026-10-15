/**
 * Listens for native file drops on the current webview.
 *
 * Tauri intercepts OS drag-and-drop (because `dragDropEnabled` is on), so the
 * HTML5 `drop` event never sees real file paths — we have to use the webview's
 * own event, which *does* include them.
 */
import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { isTauri } from "@/lib/tauri";

export function useFileDrop(onDrop: (paths: string[]) => void): void {
  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") onDrop(event.payload.paths);
      })
      .then((off) => {
        if (active) unlisten = off;
        else off();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [onDrop]);
}
