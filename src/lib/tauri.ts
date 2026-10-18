/**
 * Thin, typed wrapper around Tauri's IPC layer.
 *
 * Every backend command is declared once here so the rest of the app gets
 * autocomplete and compile-time safety instead of stringly-typed `invoke` calls.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** True when running inside the Tauri shell (false in a plain browser). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Invoke a backend command, surfacing errors as `Error` objects. */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(
      `Cannot call "${command}": Aether's backend isn't running. Start the app with \`npm run tauri:dev\`.`,
    );
  }
  return tauriInvoke<T>(command, args);
}

/** Subscribe to a backend event. Returns an unsubscribe function. */
export async function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return listen<T>(event, (message) => handler(message.payload));
}

// ---------------------------------------------------------------------------
// Shared backend types (mirror of the Rust structs)
// ---------------------------------------------------------------------------

export type LoaderKind = "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";

export type AccountKind = "microsoft" | "offline";

export interface PublicAccount {
  uuid: string;
  username: string;
  kind: AccountKind;
  skinUrl: string | null;
  active: boolean;
}

export interface SkinView {
  skinUrl?: string | null;
  variant?: "classic" | "slim" | null;
  capeUrl?: string | null;
}

export interface SkinCurrentResponse {
  account: PublicAccount | null;
  skin: SkinView;
}

/**
 * Where the game opens when it starts (1.20+ "Quick Play").
 *
 * The tags are the backend's camelCase variant names and must match exactly:
 * serde rejects anything else, taking the whole settings save down with it.
 */
export interface QuickPlay {
  type: "none" | "multiplayer" | "singleplayer" | "singleplayerContinue";
  address?: string;
  world?: string;
}

export interface InstanceSettings {
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string[];
  gameArgs: string[];
  javaPath: string | null;
  gameDir: string | null;
  width: number;
  height: number;
  fullscreen: boolean;
  quickPlay: QuickPlay;
  env: [string, string][];
}

export interface InstalledProject {
  projectId: string;
  versionId: string;
  title: string;
  iconUrl: string | null;
  projectType: string;
  files: string[];
  installedAt: string | null;
}

export interface Instance {
  id: string;
  name: string;
  icon: string | null;
  gameVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  group: string | null;
  tags: string[];
  created: string;
  lastPlayed: string | null;
  playTimeSecs: number;
  notes: string | null;
  settings: InstanceSettings;
  installedProjects: InstalledProject[];
}

export interface InstanceSummary {
  id: string;
  name: string;
  gameVersion: string;
  loader: string;
  loaderVersion: string | null;
  icon: string | null;
  lastPlayed: string | null;
  playTimeSecs: number;
  modCount: number;
  installed: boolean;
}

export interface ContentEntry {
  name: string;
  path: string;
  enabled: boolean;
  size: number;
  kind: string;
  projectId: string | null;
  versionId: string | null;
  title: string | null;
  iconUrl: string | null;
}

/** One entry of an instance's in-game multiplayer list (`servers.dat`). */
export interface ServerEntry {
  name: string;
  /** `host` or `host:port`, exactly as the game stores it. */
  address: string;
  /** Base64 PNG without a `data:` prefix, as the game caches it. */
  icon: string | null;
  hidden: boolean;
  acceptTextures: boolean;
}

/** An instance's server list, plus where the file lives. */
export interface ServerListFile {
  path: string;
  /** False when this instance has never had a multiplayer list. */
  exists: boolean;
  servers: ServerEntry[];
}

/** One world folder in an instance's `saves/`. */
export interface World {
  name: string;
  path: string;
  /** Bytes on disk, everything the world owns. */
  size: number;
  /** When it was last played, or null when the platform will not say. */
  modified: string | null;
  /** The game's `icon.png` for it, when it has drawn one. */
  icon: string | null;
}

/** One zip in an instance's backup folder. */
export interface WorldBackup {
  /** File name; restoring and deleting refer to a backup by this. */
  name: string;
  path: string;
  /** The world it was taken from, read back out of the file name. */
  world: string;
  size: number;
  created: string | null;
}

/** What a restore did, so the UI can say where the replaced world went. */
export interface RestoredWorld {
  world: string;
  /** Safety backup of the world that was replaced, when there was one. */
  safety: string | null;
}

/** Everything the Worlds tab needs, in one round trip. */
export interface WorldsOverview {
  savesPath: string;
  backupsPath: string;
  worlds: World[];
  backups: WorldBackup[];
}

/** One screenshot in an instance's `screenshots/`. */
export interface Screenshot {
  name: string;
  path: string;
  size: number;
  /** When the shot was taken, i.e. when the file was written. */
  taken: string | null;
}

/** An instance's screenshots, plus where the folder lives. */
export interface ScreenshotsFile {
  path: string;
  /** False when this instance has never taken a screenshot. */
  exists: boolean;
  screenshots: Screenshot[];
}

export interface Progress {
  stage: string;
  label: string;
  current: number;
  total: number;
  filesDone: number;
  filesTotal: number;
  finished: boolean;
}

export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
}

export interface JavaRuntime {
  path: string;
  version: string;
  major: number;
  source: string;
  vendor: string;
}

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
  dataDir: string;
  instancesDir: string;
  javaDir: string;
  cacheDir: string;
  modrinthApiUrl: string;
}

export interface Settings {
  javaPath: string | null;
  defaultMemoryMin: number;
  defaultMemoryMax: number;
  defaultJvmArgs: string[];
  concurrentDownloads: number;
  checkUpdatesOnStart: boolean;
  showSnapshots: boolean;
  closeOnLaunch: boolean;
  keepLauncherOpen: boolean;
  theme: "dark" | "light" | "system";
  modrinthApiUrl: string;
}

export interface VersionOption {
  id: string;
  versionType: string;
  releaseTime: string;
  latestRelease: boolean;
}

export interface LoaderVersion {
  version: string;
  stable: boolean;
  gameVersion: string;
}

export interface LaunchedProcess {
  pid: number;
  logFile: string;
  command: string;
  arguments: string[];
}

/** One line of game output, pushed over `game://output` as it is produced. */
export interface GameOutput {
  instanceId: string;
  stream: "stdout" | "stderr";
  line: string;
}

/** Final status of a game process, pushed over `game://exit`. */
export interface GameExit {
  instanceId: string;
  /** Exit code, or null when the process was killed by a signal. */
  code: number | null;
}

export interface ModpackPreview {
  name: string;
  summary: string | null;
  versionId: string;
  gameVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  fileCount: number;
  totalSize: number;
  dependencies: Record<string, string>;
}

// ---- Import from other launchers ------------------------------------------

/** Launchers (and fallbacks) the importer knows how to read instances from. */
export type ImportSource = "prism" | "multimc" | "curseforge" | "modrinth" | "minecraft" | "folder";

/** A detected installation of another launcher on this machine. */
export interface ImportSourceInfo {
  kind: ImportSource;
  label: string;
  path: string;
  found: boolean;
  note: string | null;
}

/** One instance discovered in another launcher's data directory. */
export interface ImportCandidate {
  id: string;
  kind: ImportSource;
  source: string;
  name: string;
  path: string;
  icon: string | null;
  gameVersion: string | null;
  loader: LoaderKind | null;
  loaderVersion: string | null;
  size: number;
  mods: number;
  modified: number | null;
  note: string | null;
}

/** Result of a full scan: which launchers were found and what's inside them. */
export interface ImportScan {
  sources: ImportSourceInfo[];
  candidates: ImportCandidate[];
}

/** What the dialog asks Aether to create for one imported instance. */
export interface ImportRequest {
  source: ImportSource;
  name: string;
  path: string;
  gameVersion: string;
  loader: LoaderKind;
  loaderVersion: string | null;
  icon: string | null;
}

/** One item that could not be imported, with the reason. */
export interface ImportFailure {
  name: string;
  path: string;
  error: string;
}

/** Outcome of a bulk import: successes plus per-item failures. */
export interface ImportOutcome {
  imported: Instance[];
  failed: ImportFailure[];
}

// ---- Modrinth -------------------------------------------------------------

export interface SearchHit {
  projectId: string;
  projectType: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  displayCategories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  iconUrl: string | null;
  dateCreated: string | null;
  dateModified: string | null;
  latestVersion: string | null;
  license: string | null;
  clientSide: string | null;
  serverSide: string | null;
  gallery: string[];
}

export interface SearchResponse {
  hits: SearchHit[];
  offset: number;
  limit: number;
  totalHits: number;
}

export interface SearchFilters {
  query: string;
  projectType?: string | null;
  gameVersion?: string | null;
  loader?: string | null;
  categories: string[];
  index?: string | null;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  projectType: string;
  categories: string[];
  additionalCategories: string[];
  gameVersions: string[];
  loaders: string[];
  downloads: number;
  followers: number;
  iconUrl: string | null;
  gallery: { url: string; featured: boolean; title: string | null; description: string | null }[];
  license: { id: string; name: string; url: string | null } | null;
  sourceUrl: string | null;
  issuesUrl: string | null;
  wikiUrl: string | null;
  discordUrl: string | null;
  clientSide: string | null;
  serverSide: string | null;
  published: string | null;
  updated: string | null;
  versions: string[];
}

export interface ModrinthVersionFile {
  hashes: Record<string, string>;
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  fileType: string | null;
}

export interface ModrinthDependency {
  versionId: string | null;
  projectId: string | null;
  fileName: string | null;
  dependencyType: string;
}

export interface ModrinthVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  versionType: string;
  gameVersions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
  dependencies: ModrinthDependency[];
  downloads: number;
  datePublished: string | null;
  changelog: string | null;
}

export interface ModrinthTag {
  name: string;
  versionType: string | null;
  projectType: string | null;
  icon: string | null;
}

export interface UpdateInfo {
  projectId: string;
  title: string;
  iconUrl: string | null;
  currentVersionId: string;
  latestVersionId: string;
  latestVersionName: string;
  changelog: string | null;
  projectType: string;
}

// ---------------------------------------------------------------------------
// Content scanning
// ---------------------------------------------------------------------------

/**
 * How much weight a finding should carry. These are evidence, not verdicts —
 * a `warning` is a capability mods rarely need, not proof of malice.
 */
export type ScanSeverity = "info" | "warning" | "critical";

/** One concrete thing the scanner noticed. */
export interface ScanFinding {
  severity: ScanSeverity;
  /** Stable machine code, e.g. `msa_tokens`, `embedded_executable`. */
  code: string;
  summary: string;
  /** Why this matters, in plain language. */
  detail: string;
  /** Path inside the archive that triggered it, when it was a specific entry. */
  entry: string | null;
}

/** Whether a file is still byte-for-byte the file Modrinth published. */
export type ProvenanceStatus = "verified" | "unknown" | "unchecked";

export interface ScanProvenance {
  status: ProvenanceStatus;
  project: string | null;
  version: string | null;
  projectId: string | null;
}

/** The result for a single mod or pack. */
export interface ScanFileReport {
  /** Path relative to the instance's game directory, e.g. `mods/sodium.jar`. */
  file: string;
  /** `mod`, `resourcepack`, `shaderpack` or `datapack`. */
  kind: string;
  size: number;
  sha1: string;
  /** Worst severity first; empty when nothing was flagged. */
  findings: ScanFinding[];
  provenance: ScanProvenance;
  /** True when the scan hit a budget and stopped looking early. */
  truncated: boolean;
}

/** Everything a scan learned about an instance's content. */
export interface ScanReport {
  /** Worst severity first, then by path; clean files come last. */
  files: ScanFileReport[];
  examined: number;
  critical: number;
  warnings: number;
  /** False when the Modrinth hash lookup could not run (e.g. offline). */
  provenanceChecked: boolean;
  durationMs: number;
}
