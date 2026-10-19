import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
    <header className="drag-region flex h-9 shrink-0 items-center border-b bg-[#17191c]">
      <div className="flex items-center px-3 text-[11px] font-medium text-muted-foreground">
        <span>Aether</span>
      </div>

      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <div className="no-drag flex h-full items-stretch" aria-label="Window controls">
        <button
          type="button"
          aria-label="Minimize window"
          className="grid w-10 place-items-center text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void minimize()}
        >
          <Minus className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Maximize or restore window"
          className="grid w-10 place-items-center text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void toggleMaximize()}
        >
          <Square className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Close window"
          className="grid w-10 place-items-center text-muted-foreground transition-colors hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => void close()}
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
