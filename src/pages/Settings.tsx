import { useEffect, useState, type ReactNode } from "react";
import {
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sliders,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { system } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { usePersistentState } from "@/hooks/usePersistentState";
import { applyAccentTheme, useSettings } from "@/store/useSettings";
import { useUpdater } from "@/store/useUpdater";

const JAVA_MAJORS = [8, 16, 17, 21, 25];
const RELEASES_URL = "https://github.com/EyeSaberYT/Aether/releases/latest";
const ACCENT_THEMES = [
  { id: "green", label: "Aether green", color: "#1bd96e" },
  { id: "red", label: "Red", color: "#ef5350" },
  { id: "purple", label: "Purple", color: "#a78bfa" },
  { id: "blue", label: "Blue", color: "#50aaff" },
] as const;
const SETTINGS_PANELS = [
  { id: "appearance", label: "Appearance", icon: Palette, help: "Theme and display" },
  { id: "general", label: "General", icon: Sliders, help: "Launcher behavior" },
  { id: "java", label: "Java", icon: Cpu, help: "Runtime management" },
  { id: "memory", label: "Memory & JVM", icon: Monitor, help: "Default resources" },
  { id: "storage", label: "Storage", icon: FolderOpen, help: "Files and cache" },
  { id: "updates", label: "Updates", icon: RefreshCw, help: "Version status" },
  { id: "about", label: "About", icon: Info, help: "App information" },
] as const;
type SettingsPanel = (typeof SETTINGS_PANELS)[number]["id"];

interface SettingsProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Settings opens as an overlay from the navigation rail, without replacing the current screen. */
export function Settings({ open, onOpenChange }: SettingsProps = {}) {
  if (open === undefined || !onOpenChange) return <SettingsPanel />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="settings-dialog-content">
        <SettingsPanel onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Global launcher preferences. All fields remain connected to the existing settings store. */
function SettingsPanel({ onClose }: { onClose?: () => void } = {}) {
  const settings = useSettings((state) => state.settings);
  const appInfo = useSettings((state) => state.appInfo);
  const runtimes = useSettings((state) => state.javaRuntimes);
  const save = useSettings((state) => state.save);
  const refreshJava = useSettings((state) => state.refreshJava);
  const installJava = useSettings((state) => state.installJava);
  const updateStatus = useUpdater((state) => state.status);
  const pendingUpdate = useUpdater((state) => state.update);
  const updateProgress = useUpdater((state) => state.progress);
  const updateError = useUpdater((state) => state.error);
  const checkForUpdates = useUpdater((state) => state.check);
  const installUpdate = useUpdater((state) => state.install);
  const relaunchApp = useUpdater((state) => state.relaunch);

  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [installMajor, setInstallMajor] = useState("21");
  const [installing, setInstalling] = useState(false);
  const [activePanel, setActivePanel] = useState<SettingsPanel>("general");
  const [accent, setAccent] = usePersistentState<string>("aether.appearance.accent", "green");
  const [customAccent, setCustomAccent] = usePersistentState<string>(
    "aether.appearance.customAccent",
    "#1bd96e",
  );
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    applyAccentTheme(accent, customAccent);
  }, [accent, customAccent]);

  async function persist(patch?: Partial<NonNullable<typeof settings>>) {
    if (!draft && !patch) return;
    setSaving(true);
    try {
      await save(patch ?? draft!);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallJava() {
    setInstalling(true);
    const toastId = toast.loading(`Downloading Java ${installMajor}…`);
    try {
      const runtime = await installJava(Number(installMajor));
      toast.success(`Java ${runtime.major} installed`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { id: toastId });
    } finally {
      setInstalling(false);
    }
  }

  function chooseAccent(nextAccent: string) {
    try {
      window.localStorage.setItem("aether.appearance.accent", nextAccent);
    } catch {
      // Keep the selection for this session if persistent storage is unavailable.
    }
    setAccent(nextAccent);
    applyAccentTheme(nextAccent, customAccent);
  }

  function chooseCustomAccent(color: string) {
    try {
      window.localStorage.setItem("aether.appearance.customAccent", color);
      window.localStorage.setItem("aether.appearance.accent", "custom");
    } catch {
      // Keep the selection for this session if persistent storage is unavailable.
    }
    setCustomAccent(color);
    setAccent("custom");
    applyAccentTheme("custom", color);
  }

  if (!settings || !draft) {
    return (
      <div className={`settings-screen ${onClose ? "settings-screen-dialog" : ""}`}>
        <div className="settings-popup settings-popup-loading">Loading launcher preferences…</div>
      </div>
    );
  }

  const pathRows: Array<[string, string | undefined]> = [
    ["Data directory", appInfo?.dataDir],
    ["Instances", appInfo?.instancesDir],
    ["Java runtimes", appInfo?.javaDir],
    ["Cache", appInfo?.cacheDir],
  ];

  return (
    <div className={`settings-screen ${onClose ? "settings-screen-dialog" : ""}`}>
      <section className="settings-popup" role="region" aria-label="Aether settings">
        <header className="settings-popup-header">
          <div>
            <p className="eyebrow text-primary">Launcher preferences</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-xs text-muted-foreground">Configure Aether for your setup.</p>
          </div>
          {onClose && (
            <div className="settings-header-actions">
              <Button variant="ghost" size="icon" aria-label="Close settings" onClick={onClose}>
                <X />
              </Button>
            </div>
          )}
        </header>

        <div className="settings-popup-layout">
          <nav
            className="settings-index"
            aria-label="Settings categories"
            role="tablist"
            aria-orientation="vertical"
          >
            {SETTINGS_PANELS.map(({ id, label, icon: Icon, help }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activePanel === id}
                aria-controls="settings-panel-content"
                onClick={() => setActivePanel(id)}
                className={`settings-index-link ${activePanel === id ? "settings-index-link-active" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <b>{label}</b>
                  <small>{help}</small>
                </span>
              </button>
            ))}
          </nav>

          <main id="settings-panel-content" role="tabpanel" className="settings-pane">
            {activePanel === "appearance" && (
              <SettingsSection
                id="appearance"
                icon={Palette}
                title="Appearance"
                subtitle="Tune how the launcher looks."
              >
                <div className="theme-choices">
                  {(["dark", "light", "system"] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        setDraft({ ...draft, theme });
                        void persist({ theme });
                      }}
                      className={`theme-choice ${draft.theme === theme ? "theme-choice-active" : ""}`}
                    >
                      <span className={`theme-swatch theme-swatch-${theme}`} />
                      <span className="capitalize">{theme}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-7">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold">Accent color</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose the highlight color used across Aether.
                    </p>
                  </div>
                  <div className="accent-choices" role="radiogroup" aria-label="Accent color">
                    {ACCENT_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={accent === theme.id}
                        onClick={() => chooseAccent(theme.id)}
                        className={`accent-choice ${accent === theme.id ? "accent-choice-active" : ""}`}
                      >
                        <span
                          className="accent-choice-dot"
                          style={{ backgroundColor: theme.color }}
                        />
                        <span>{theme.label}</span>
                      </button>
                    ))}
                  </div>
                  <label
                    className={`custom-accent-choice ${accent === "custom" ? "custom-accent-choice-active" : ""}`}
                  >
                    <span className="accent-choice-dot" style={{ backgroundColor: customAccent }} />
                    <span className="flex-1">Custom color</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {customAccent.toUpperCase()}
                    </span>
                    <input
                      type="color"
                      aria-label="Choose a custom accent color"
                      value={customAccent}
                      onChange={(event) => chooseCustomAccent(event.target.value)}
                      className="custom-color-input"
                    />
                  </label>
                </div>
              </SettingsSection>
            )}

            {activePanel === "general" && (
              <SettingsSection
                id="general"
                icon={Sliders}
                title="General"
                subtitle="Launcher behavior and downloads."
              >
                <div className="divide-y divide-border/70">
                  <PreferenceToggle
                    label="Show snapshots and betas"
                    description="Include unreleased Minecraft versions in version pickers."
                    checked={draft.showSnapshots}
                    onChange={(value) => setDraft({ ...draft, showSnapshots: value })}
                  />
                  <PreferenceToggle
                    label="Check for updates on launch"
                    description="Look for newer mod and modpack versions when Aether starts."
                    checked={draft.checkUpdatesOnStart}
                    onChange={(value) => setDraft({ ...draft, checkUpdatesOnStart: value })}
                  />
                  <PreferenceToggle
                    label="Close launcher when game starts"
                    description="Quit Aether as soon as Minecraft opens."
                    checked={draft.closeOnLaunch}
                    onChange={(value) => setDraft({ ...draft, closeOnLaunch: value })}
                  />
                  <PreferenceToggle
                    label="Keep launcher open"
                    description="Keep Aether available while Minecraft is running."
                    checked={draft.keepLauncherOpen}
                    onChange={(value) => setDraft({ ...draft, keepLauncherOpen: value })}
                  />
                  <div className="preference-row">
                    <div>
                      <p className="text-sm font-semibold">Concurrent downloads</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        How many files to fetch in parallel.
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={32}
                      className="w-24"
                      value={draft.concurrentDownloads}
                      onChange={(event) =>
                        setDraft({ ...draft, concurrentDownloads: Number(event.target.value) || 1 })
                      }
                    />
                  </div>
                </div>
              </SettingsSection>
            )}

            {activePanel === "java" && (
              <SettingsSection
                id="java"
                icon={Cpu}
                title="Java"
                subtitle="Aether can manage the right runtime for each Minecraft version."
              >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
                  <div className="space-y-4">
                    <Field
                      label="Java executable"
                      hint="Leave blank to auto-detect per game version."
                    >
                      <Input
                        value={draft.javaPath ?? ""}
                        placeholder="Auto-detect"
                        onChange={(event) =>
                          setDraft({ ...draft, javaPath: event.target.value || null })
                        }
                      />
                    </Field>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <Label>Installed runtimes</Label>
                        <Button variant="ghost" size="sm" onClick={() => void refreshJava()}>
                          <RefreshCw /> Refresh
                        </Button>
                      </div>
                      {runtimes.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                          No Java runtimes detected. Aether will download one when a game needs it.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {runtimes.map((runtime) => (
                            <li key={runtime.path} className="runtime-row">
                              <Terminal className="h-4 w-4 shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                  Java {runtime.major} · {runtime.version}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {runtime.path}
                                </p>
                              </div>
                              <Badge variant="muted">{runtime.vendor || runtime.source}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="runtime-install-card">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Download className="h-4 w-4" />
                    </div>
                    <h3 className="mt-3 font-semibold">Add a runtime</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Download a supported Java runtime directly into Aether.
                    </p>
                    <Select value={installMajor} onValueChange={setInstallMajor}>
                      <SelectTrigger className="mt-4 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JAVA_MAJORS.map((major) => (
                          <SelectItem key={major} value={String(major)}>
                            Java {major}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      className="mt-2 w-full"
                      variant="outline"
                      disabled={installing}
                      onClick={handleInstallJava}
                    >
                      {installing ? <Spinner /> : <Cpu />} Install Java
                    </Button>
                  </div>
                </div>
              </SettingsSection>
            )}

            {activePanel === "memory" && (
              <SettingsSection
                id="memory"
                icon={Monitor}
                title="Memory & JVM"
                subtitle="Default resource limits for newly created instances."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Minimum memory (MB)">
                    <Input
                      type="number"
                      value={draft.defaultMemoryMin}
                      onChange={(event) =>
                        setDraft({ ...draft, defaultMemoryMin: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field label="Maximum memory (MB)">
                    <Input
                      type="number"
                      value={draft.defaultMemoryMax}
                      onChange={(event) =>
                        setDraft({ ...draft, defaultMemoryMax: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                </div>
              </SettingsSection>
            )}

            {activePanel === "storage" && (
              <SettingsSection
                id="storage"
                icon={FolderOpen}
                title="Storage"
                subtitle="Aether’s local files and cache locations."
              >
                <div className="divide-y divide-border/70">
                  {pathRows.map(([label, path]) =>
                    path ? (
                      <div key={label} className="preference-row">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{label}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{path}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Open ${label}`}
                          onClick={() => void system.reveal(path)}
                        >
                          <FolderOpen />
                        </Button>
                      </div>
                    ) : null,
                  )}
                </div>
              </SettingsSection>
            )}

            {activePanel === "updates" && (
              <SettingsSection
                id="updates"
                icon={RefreshCw}
                title="Updates"
                subtitle="Keep Aether up to date."
              >
                {updateStatus === "downloading" && updateProgress ? (
                  <div className="space-y-3">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>Downloading Aether {pendingUpdate?.version ?? ""}</span>
                      <span className="text-muted-foreground">
                        {updateProgress.total
                          ? `${formatBytes(updateProgress.downloaded)} / ${formatBytes(updateProgress.total)}`
                          : formatBytes(updateProgress.downloaded)}
                      </span>
                    </div>
                    <Progress
                      value={
                        updateProgress.total
                          ? (updateProgress.downloaded / updateProgress.total) * 100
                          : undefined
                      }
                    />
                  </div>
                ) : updateStatus === "installed" ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm">
                      Aether {pendingUpdate?.version} is installed. Restart to finish updating.
                    </p>
                    <Button variant="brand" onClick={() => void relaunchApp()}>
                      <RotateCcw /> Restart now
                    </Button>
                  </div>
                ) : updateStatus === "available" && pendingUpdate ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm">Aether {pendingUpdate.version} is ready to install.</p>
                    <Button variant="brand" onClick={() => void installUpdate()}>
                      <Download /> Update now
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                      {updateStatus === "checking"
                        ? "Checking for updates…"
                        : updateStatus === "up-to-date"
                          ? `You're on the latest version (${appInfo?.version ?? "unknown"}).`
                          : updateStatus === "error"
                            ? (updateError ?? "Update check failed.")
                            : "Check for the latest Aether release."}
                    </p>
                    <Button
                      variant="outline"
                      disabled={updateStatus === "checking"}
                      onClick={() => void checkForUpdates()}
                    >
                      {updateStatus === "checking" ? <Spinner /> : <RefreshCw />} Check for updates
                    </Button>
                  </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">
                  Need an installer? <InlineLink href={RELEASES_URL}>Browse releases</InlineLink>
                </p>
              </SettingsSection>
            )}

            {activePanel === "about" && (
              <SettingsSection
                id="about"
                icon={Info}
                title="About Aether"
                subtitle="Free, open source, and built for Minecraft."
              >
                {appInfo ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ["Version", appInfo.version],
                      ["Platform", `${appInfo.os} · ${appInfo.arch}`],
                      ["Application", appInfo.name],
                    ].map(([label, value]) => (
                      <div key={label} className="about-tile">
                        <small>{label}</small>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading application information…</p>
                )}
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Downloaded game assets and metadata are cached under the data directory listed
                  above. Aether is MIT-licensed.
                </p>
              </SettingsSection>
            )}
          </main>
        </div>
        <footer className="settings-popup-footer">
          <Button variant="brand" disabled={saving} onClick={() => void persist()}>
            {saving ? <Spinner /> : <Settings2 />} Save changes
          </Button>
          <p className="text-xs text-muted-foreground">Settings are saved on this device.</p>
        </footer>
      </section>
    </div>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section id={`settings-${id}`} className="settings-section">
      <header className="settings-section-head">
        <span className="settings-section-icon">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PreferenceToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="preference-row cursor-pointer">
      <span>
        <b className="block text-sm font-semibold">{label}</b>
        <small className="mt-1 block text-xs text-muted-foreground">{description}</small>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function InlineLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <button
      type="button"
      onClick={() => void system.openUrl(href)}
      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}
