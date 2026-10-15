/**
 * Global launcher settings, environment info and the installed Java runtimes.
 */
import { create } from "zustand";

import { java as javaApi, system } from "@/lib/api";
import type { AppInfo, JavaRuntime, Settings } from "@/lib/tauri";

interface SettingsState {
  settings: Settings | null;
  appInfo: AppInfo | null;
  javaRuntimes: JavaRuntime[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  refreshJava: () => Promise<void>;
  installJava: (major: number) => Promise<JavaRuntime>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  appInfo: null,
  javaRuntimes: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true });
    try {
      const [settings, appInfo, javaRuntimes] = await Promise.all([
        system.getSettings(),
        system.appInfo(),
        javaApi.list().catch(() => [] as JavaRuntime[]),
      ]);
      set({ settings, appInfo, javaRuntimes, error: null });
      applyTheme(settings.theme);
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },

  save: async (patch) => {
    const current = get().settings;
    if (!current) throw new Error("Settings haven't loaded yet.");
    const next = { ...current, ...patch };
    const saved = await system.saveSettings(next);
    set({ settings: saved });
    applyTheme(saved.theme);
    return saved;
  },

  refreshJava: async () => {
    const javaRuntimes = await javaApi.list();
    set({ javaRuntimes });
  },

  installJava: async (major) => {
    const runtime = await javaApi.install(major);
    await get().refreshJava();
    return runtime;
  },
}));

/** Toggle the `.light` / `.dark` class on <html> to match the chosen theme. */
export function applyTheme(theme: Settings["theme"]): void {
  const root = document.documentElement;
  const prefersLight =
    theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches;
  const light = theme === "light" || prefersLight;
  root.classList.toggle("light", light);
  root.classList.toggle("dark", !light);
}
