import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { BrandMark } from "@/components/layout/Sidebar";

/** Native-feeling window chrome for the undecorated desktop window. */
export function WindowControls() {
  const minimize = async () => {
    await getCurrentWindow().minimize();
  };

  const toggleMaximize = async () => {
    await getCurrentWindow().toggleMaximize();
  };

  const close = async () => {
    await getCurrentWindow().close();
  };

  return (
    <header className="drag-region flex h-10 shrink-0 items-center border-b bg-card/65">
      <div className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <BrandMark className="h-5 w-5 rounded-md" />
        <span>Aether</span>
      </div>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <div className="no-drag flex h-full items-stretch" aria-label="Window controls">
        <button
          type="button"
          aria-label="Minimize window"
          className="grid w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void minimize()}
        >
          <Minus className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Maximize or restore window"
          className="grid w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void toggleMaximize()}
        >
          <Square className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Close window"
          className="grid w-11 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void close()}
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
