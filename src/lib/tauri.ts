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
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
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

export interface QuickPlay {
  type: "Multiplayer" | "Singleplayer" | "SingleplayerContinue" | "None";
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
  microsoftClientId: string;
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
