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
      applySavedAccentTheme();
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

/** Restore the independent accent preference once settings load. */
function applySavedAccentTheme(): void {
  try {
    const savedAccent = window.localStorage.getItem("aether.appearance.accent");
    const customColor = window.localStorage.getItem("aether.appearance.customAccent") ?? "#1bd96e";
    applyAccentTheme(savedAccent ?? "green", customColor);
  } catch {
    applyAccentTheme("green", "#1bd96e");
  }
}

/** Apply one of the built-in accent palettes or a user-picked hex color. */
export function applyAccentTheme(accent: string, customColor: string): void {
  const root = document.documentElement;
  const choices = ["green", "red", "purple", "blue"];
  const selected = choices.includes(accent) ? accent : accent === "custom" ? "custom" : "green";
  root.dataset.accent = selected;
  if (selected !== "custom") {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--ring");
    return;
  }

  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(customColor);
  if (!match) return;
  const [r, g, b] = match.slice(1).map((channel) => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const token = `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
  const foreground = lightness > 0.55 ? "150 70% 6%" : "0 0% 100%";
  root.style.setProperty("--primary", token);
  root.style.setProperty("--primary-foreground", foreground);
  root.style.setProperty("--ring", token);
}
