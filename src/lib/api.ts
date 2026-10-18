/**
 * Typed wrappers around every Aether backend command.
 *
 * Keeping the command names and their camelCase argument objects in one place
 * means components never call `invoke("...")` with a hand-typed string, and the
 * interface between the React app and the Rust core stays in sync with
 * `src-tauri/src/lib.rs`.
 */
import {
  invoke,
  type AppInfo,
  type ContentEntry,
  type DeviceCodeInfo,
  type Instance,
  type InstanceSettings,
  type InstanceSummary,
  type InstalledProject,
  type JavaRuntime,
  type LaunchedProcess,
  type LoaderVersion,
  type ModpackPreview,
  type ModrinthProject,
  type ModrinthTag,
  type ModrinthVersion,
  type PublicAccount,
  type QuickPlay,
  type RestoredWorld,
  type ScanReport,
  type ScreenshotsFile,
  type SearchFilters,
  type SearchResponse,
  type ServerEntry,
  type ServerListFile,
  type Settings,
  type UpdateInfo,
  type VersionOption,
  type WorldsOverview,
} from "@/lib/tauri";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  accounts: () => invoke<PublicAccount[]>("auth_accounts"),
  current: () => invoke<PublicAccount | null>("auth_current"),
  loginMicrosoft: () => invoke<PublicAccount>("auth_login_microsoft"),
  /** URL to open for the legacy (Microsoft client id) browser sign-in. */
  legacyUrl: () => invoke<string>("auth_legacy_url"),
  /** Finish that sign-in using the URL copied out of the browser. */
  loginMicrosoftLegacy: (redirect: string) =>
    invoke<PublicAccount>("auth_login_microsoft_legacy", { redirect }),
  loginOffline: (username: string, setActive = true) =>
    invoke<PublicAccount>("auth_login_offline", { username, setActive }),
  logout: (uuid: string) => invoke<PublicAccount[]>("auth_logout", { uuid }),
  setActive: (uuid: string) => invoke<PublicAccount[]>("auth_set_active", { uuid }),
};

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export interface CreateInstanceArgs {
  name: string;
  gameVersion: string;
  loader: string;
  loaderVersion?: string | null;
  icon?: string | null;
  group?: string | null;
  tags?: string[];
  installLoader?: boolean;
}

export const instances = {
  list: () => invoke<InstanceSummary[]>("instance_list"),
  get: (id: string) => invoke<Instance>("instance_get", { id }),
  create: (args: CreateInstanceArgs) => invoke<Instance>("instance_create", { args }),
  update: (instance: Instance) => invoke<Instance>("instance_update", { instance }),
  rename: (id: string, name: string) => invoke<Instance>("instance_rename", { id, name }),
  duplicate: (id: string, name?: string) =>
    invoke<Instance>("instance_duplicate", { id, name: name ?? null }),
  remove: (id: string, deleteFiles: boolean) =>
    invoke<void>("instance_delete", { id, deleteFiles }),
  installLoader: (id: string, loaderVersion?: string) =>
    invoke<Instance>("instance_install_loader", { id, loaderVersion: loaderVersion ?? null }),
  content: (id: string) => invoke<ContentEntry[]>("instance_content", { id }),
  toggleContent: (id: string, path: string, enabled: boolean) =>
    invoke<string>("instance_toggle_content", { id, path, enabled }),
  deleteContent: (id: string, path: string) =>
    invoke<void>("instance_delete_content", { id, path }),
  importFiles: (id: string, paths: string[], folder?: string) =>
    invoke<number>("instance_import_files", { id, paths, folder: folder ?? null }),
  paths: (id: string) => invoke<Record<string, string>>("instance_paths", { id }),
  contentDirName: (projectType: string) =>
    invoke<string>("instance_content_dir_name", { projectType }),
  defaultSettings: () => invoke<InstanceSettings>("instance_default_settings"),
  slug: (name: string) => invoke<string>("instance_slug", { name }),
};

export const modpacks = {
  preview: (path: string) => invoke<ModpackPreview>("modpack_preview", { path }),
  import: (path: string, name?: string) =>
    invoke<Instance>("modpack_import", { path, name: name ?? null }),
  export: (id: string, target: string) => invoke<string>("modpack_export", { id, target }),
};

// ---------------------------------------------------------------------------
// Server list
// ---------------------------------------------------------------------------

export const servers = {
  /** The instance's `servers.dat`, as the game would see it. */
  list: (id: string) => invoke<ServerListFile>("servers_list", { id }),
  /** Replace the whole list. Validation happens in the backend. */
  save: (id: string, servers: ServerEntry[]) =>
    invoke<ServerListFile>("servers_save", { id, servers }),
};

// ---------------------------------------------------------------------------
// Worlds, backups and screenshots
// ---------------------------------------------------------------------------

export const worlds = {
  /** Every world in the instance, and every backup taken of them. */
  overview: (id: string) => invoke<WorldsOverview>("worlds_overview", { id }),
  /** Zip a world into the instance's backup folder. */
  backup: (id: string, world: string) =>
    invoke<WorldsOverview>("world_backup_create", { id, world }),
  /** Replace a world with one of its backups. */
  restore: (id: string, file: string) =>
    invoke<RestoredWorld>("world_backup_restore", { id, file }),
  deleteBackup: (id: string, file: string) =>
    invoke<WorldsOverview>("world_backup_delete", { id, file }),
};

export const screenshots = {
  /** The instance's screenshots, newest first. */
  list: (id: string) => invoke<ScreenshotsFile>("screenshots_list", { id }),
  remove: (id: string, name: string) => invoke<ScreenshotsFile>("screenshot_delete", { id, name }),
};

// ---------------------------------------------------------------------------
// Versions & loaders
// ---------------------------------------------------------------------------

export const versions = {
  list: (includeSnapshots = false) =>
    invoke<VersionOption[]>("versions_list", { includeSnapshots }),
  refresh: () => invoke<void>("versions_refresh"),
  latest: () => invoke<string>("versions_latest"),
  loaderVersions: (loaderKind: string, gameVersion: string) =>
    invoke<LoaderVersion[]>("loader_versions", { loaderKind, gameVersion }),
};

// ---------------------------------------------------------------------------
// Launching
// ---------------------------------------------------------------------------

export const launch = {
  /** Launch an instance, optionally opening straight into a server or world. */
  instance: (id: string, quickPlay?: QuickPlay) =>
    invoke<LaunchedProcess>("launch_instance", { id, quickPlay: quickPlay ?? null }),
  preview: (id: string) => invoke<string>("launch_preview", { id }),
  logs: (id: string, lines?: number) =>
    invoke<string | null>("launch_logs", { id, lines: lines ?? null }),
  markStopped: (id: string) => invoke<void>("launch_mark_stopped", { id }),
  running: () => invoke<string[]>("launch_running"),
};

// ---------------------------------------------------------------------------
// Modrinth
// ---------------------------------------------------------------------------

/** A single file the dependency resolver wants installed. */
export interface ResolvedFile {
  projectId: string;
  versionId: string;
  title: string;
  projectType: string;
  url: string;
  filename: string;
  sha1: string | null;
  size: number;
  iconUrl: string | null;
  /** True when it was pulled in as a dependency rather than requested. */
  dependency: boolean;
}

export const modrinth = {
  search: (filters: SearchFilters, limit = 20, offset = 0) =>
    invoke<SearchResponse>("modrinth_search", { filters, limit, offset }),
  project: (id: string) => invoke<ModrinthProject>("modrinth_project", { id }),
  projects: (ids: string[]) => invoke<ModrinthProject[]>("modrinth_projects", { ids }),
  versions: (projectId: string, gameVersion?: string, loader?: string) =>
    invoke<ModrinthVersion[]>("modrinth_versions", {
      projectId,
      gameVersion: gameVersion ?? null,
      loader: loader ?? null,
    }),
  tags: (kind: string) => invoke<ModrinthTag[]>("modrinth_tags", { kind }),
  install: (instanceId: string, projectId: string, versionId?: string) =>
    invoke<InstalledProject[]>("modrinth_install", {
      instanceId,
      projectId,
      versionId: versionId ?? null,
    }),
  installModpack: (projectId: string, versionId?: string, name?: string) =>
    invoke<Instance>("modrinth_install_modpack", {
      projectId,
      versionId: versionId ?? null,
      name: name ?? null,
    }),
  checkUpdates: (instanceId: string) =>
    invoke<UpdateInfo[]>("modrinth_check_updates", { instanceId }),
  applyUpdate: (instanceId: string, projectId: string, versionId: string) =>
    invoke<void>("modrinth_apply_update", { instanceId, projectId, versionId }),
  updateAll: (instanceId: string) => invoke<number>("modrinth_update_all", { instanceId }),
  dependencies: (instanceId: string, versionId: string) =>
    invoke<ResolvedFile[]>("modrinth_dependencies", { instanceId, versionId }),
};

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

export const java = {
  list: () => invoke<JavaRuntime[]>("java_list"),
  detect: (requiredMajor = 0) => invoke<JavaRuntime | null>("java_detect", { requiredMajor }),
  install: (requiredMajor: number) => invoke<JavaRuntime>("java_install", { requiredMajor }),
  requirement: (gameVersion: string) => invoke<number>("java_requirement", { gameVersion }),
};

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export const security = {
  /** Scan an instance's mods and packs: heuristics, then Modrinth provenance. */
  scan: (id: string) => invoke<ScanReport>("scan_instance", { id }),
};

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export const system = {
  getSettings: () => invoke<Settings>("settings_get"),
  saveSettings: (settings: Settings) => invoke<Settings>("settings_save", { settings }),
  appInfo: () => invoke<AppInfo>("app_info"),
  reveal: (path: string) => invoke<void>("system_reveal", { path }),
  openUrl: (url: string) => invoke<void>("system_open_url", { url }),
  freeSpace: () => invoke<number | null>("system_free_space"),
};

/** Re-export the raw event helper so stores can subscribe to backend events. */
export { subscribe } from "@/lib/tauri";
export type { DeviceCodeInfo };
