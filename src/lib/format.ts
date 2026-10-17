/** Formatting helpers shared across the UI. */
import type { ScanSeverity } from "@/lib/tauri";

const NUMBER_FORMAT = new Intl.NumberFormat("en", { notation: "compact" });

/** `12345` → `12.3K` */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  return NUMBER_FORMAT.format(value);
}

/** `1536` → `1.5 GB` */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}

/** `3725` → `1h 2m` */
export function formatDuration(seconds: number): string {
  if (!seconds) return "Never";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Human-friendly relative time, e.g. `3 days ago`. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";

  const diff = Date.now() - then;
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [604_800_000, "week"],
    [2_592_000_000, "month"],
    [31_536_000_000, "year"],
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (diff < 60_000) return "just now";

  for (let i = units.length - 1; i >= 0; i--) {
    const [threshold, unit] = units[i];
    if (diff >= threshold) {
      return formatter.format(-Math.floor(diff / threshold), unit);
    }
  }
  return "just now";
}

/** Title-case a loader id: `neoforge` → `NeoForge`. */
export function loaderLabel(loader: string): string {
  switch (loader) {
    case "neoforge":
      return "NeoForge";
    case "forge":
      return "Forge";
    case "fabric":
      return "Fabric";
    case "quilt":
      return "Quilt";
    default:
      return "Vanilla";
  }
}

/** Accent colour used for a loader's badge. */
export function loaderColor(loader: string): string {
  switch (loader) {
    case "fabric":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "quilt":
      return "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30";
    case "forge":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "neoforge":
      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    default:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
}

/** Colour used for a Modrinth project-type badge. */
export function projectTypeColor(type: string): string {
  switch (type) {
    case "modpack":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "resourcepack":
      return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "shader":
      return "bg-pink-500/15 text-pink-300 border-pink-500/30";
    case "datapack":
      return "bg-teal-500/15 text-teal-300 border-teal-500/30";
    default:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
}

export function projectTypeLabel(type: string): string {
  switch (type) {
    case "modpack":
      return "Modpack";
    case "resourcepack":
      return "Resource Pack";
    case "shader":
      return "Shader";
    case "datapack":
      return "Datapack";
    default:
      return "Mod";
  }
}

/** Tint for a scan severity, in the same family as the loader badges. */
export function severityColor(severity: ScanSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "warning":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    default:
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  }
}

export function severityLabel(severity: ScanSeverity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    default:
      return "Info";
  }
}

/** Pick a readable foreground colour for a solid swatch. */
export function initials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
