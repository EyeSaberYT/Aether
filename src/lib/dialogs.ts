/**
 * Small wrappers around the Tauri dialog plugin so components don't have to
 * guard for the browser case themselves.
 */
import { open, save } from "@tauri-apps/plugin-dialog";

import { isTauri } from "@/lib/tauri";

/** Open a file picker. Returns the chosen path, or `null` when cancelled. */
export async function pickFile(options?: {
  title?: string;
  extensions?: string[];
  multiple?: boolean;
}): Promise<string | null> {
  if (!isTauri) return null;
  const result = await open({
    title: options?.title,
    multiple: false,
    directory: false,
    filters: options?.extensions
      ? [{ name: "Supported files", extensions: options.extensions }]
      : undefined,
  });
  return typeof result === "string" ? result : null;
}

/** Open a folder picker. */
export async function pickDirectory(title?: string): Promise<string | null> {
  if (!isTauri) return null;
  const result = await open({ title, directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

/** Save-as picker for exports. */
export async function pickSavePath(options?: {
  title?: string;
  defaultPath?: string;
  extensions?: string[];
}): Promise<string | null> {
  if (!isTauri) return null;
  const result = await save({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.extensions
      ? [{ name: "Supported files", extensions: options.extensions }]
      : undefined,
  });
  return result ?? null;
}
