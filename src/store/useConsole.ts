/**
 * Live game console.
 *
 * The backend pushes every line the game prints over `game://output`, so the
 * buffer here fills in real time whether or not the console tab is open. Lines
 * are kept per instance and capped, because a long modded session produces far
 * more output than anyone wants to keep in memory.
 */
import { create } from "zustand";

import type { GameOutput } from "@/lib/tauri";

/** How many lines to keep per instance before dropping the oldest. */
export const CONSOLE_LIMIT = 2000;

export interface ConsoleLine {
  /** Monotonic id, used as the React key. */
  id: number;
  stream: GameOutput["stream"];
  text: string;
}

interface ConsoleState {
  /** Console contents keyed by instance id. */
  lines: Record<string, ConsoleLine[]>;
  /** Append a live line, trimming the oldest once the cap is reached. */
  append: (output: GameOutput) => void;
  /** Replace the buffer, e.g. with the tail of a previous log file. */
  replace: (instanceId: string, texts: string[]) => void;
  clear: (instanceId: string) => void;
}

let nextId = 0;

/** Trim a buffer down to the most recent `CONSOLE_LIMIT` lines. */
function cap(lines: ConsoleLine[]): ConsoleLine[] {
  return lines.length > CONSOLE_LIMIT ? lines.slice(lines.length - CONSOLE_LIMIT) : lines;
}

export const useConsole = create<ConsoleState>((set) => ({
  lines: {},

  append: ({ instanceId, stream, line }) =>
    set((state) => {
      const existing = state.lines[instanceId] ?? [];
      const appended = [...existing, { id: nextId++, stream, text: line }];
      return { lines: { ...state.lines, [instanceId]: cap(appended) } };
    }),

  replace: (instanceId, texts) =>
    set((state) => {
      const lines = texts.map((text) => ({ id: nextId++, stream: "stdout" as const, text }));
      return { lines: { ...state.lines, [instanceId]: cap(lines) } };
    }),

  clear: (instanceId) =>
    set((state) => ({
      lines: { ...state.lines, [instanceId]: [] },
    })),
}));
