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
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { system } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useSettings } from "@/store/useSettings";
import { useUpdater } from "@/store/useUpdater";
import { cn } from "@/lib/utils";

const JAVA_MAJORS = [8, 16, 17, 21, 25];

/** Where to send anyone who would rather grab an installer by hand. */
const RELEASES_URL = "https://github.com/EyeSaberYT/Aether/releases/latest";

/** Global launcher configuration. */
export function Settings() {
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

  useEffect(() => setDraft(settings), [settings]);

  if (!settings || !draft) {
    return (
      <div className="mx-auto w-full max-w-4xl px-8 py-8">
        <PageHeader title="Settings" description="Loading…" />
      </div>
    );
  }

  async function persist(patch?: Partial<typeof settings>) {
    setSaving(true);
    try {
      await save(patch ?? draft!);
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

  const pathRows: Array<[string, string | undefined]> = [
    ["Data directory", appInfo?.dataDir],
    ["Instances", appInfo?.instancesDir],
    ["Java runtimes", appInfo?.javaDir],
    ["Cache", appInfo?.cacheDir],
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-8">
      <PageHeader
        title="Settings"
        description="Tune how Aether behaves for every instance."
        actions={
          <Button variant="brand" disabled={saving} onClick={() => void persist()}>
            {saving ? <Spinner /> : <Settings2 />} Save
          </Button>
        }
      />

      <div className="mt-6 space-y-5">
        {/* Appearance */}
        <Card className="p-5">
          <SectionTitle icon={Palette} title="Appearance" />
          <Separator className="my-3" />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Theme</Label>
              <div className="flex gap-2">
                {(["dark", "light", "system"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setDraft({ ...draft, theme: option });
                      void persist({ theme: option });
                    }}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors",
                      draft.theme === option
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* General */}
        <Card className="p-5">
          <SectionTitle icon={Sliders} title="General" />
          <Separator className="my-3" />
          <div className="space-y-1">
            <Toggle
              label="Show snapshots and betas"
              description="Include unreleased Minecraft versions in the version picker."
              checked={draft.showSnapshots}
              onChange={(value) => setDraft({ ...draft, showSnapshots: value })}
            />
            <Toggle
              label="Check for updates on launch"
              description="Look for newer mod and modpack versions when Aether starts."
              checked={draft.checkUpdatesOnStart}
              onChange={(value) => setDraft({ ...draft, checkUpdatesOnStart: value })}
            />
            <Toggle
              label="Close launcher when the game starts"
              description="Quit Aether as soon as Minecraft launches."
              checked={draft.closeOnLaunch}
              onChange={(value) => setDraft({ ...draft, closeOnLaunch: value })}
            />
            <Toggle
              label="Keep the launcher open"
              description="Show a running indicator instead of quitting."
              checked={draft.keepLauncherOpen}
              onChange={(value) => setDraft({ ...draft, keepLauncherOpen: value })}
            />
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">Concurrent downloads</p>
                <p className="text-xs text-muted-foreground">
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
        </Card>

        {/* Java */}
        <Card className="p-5">
          <SectionTitle icon={Cpu} title="Java" />
          <Separator className="my-3" />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Default Java executable (blank = auto-detect)</Label>
              <Input
                value={draft.javaPath ?? ""}
                placeholder="Auto-detect per version"
                onChange={(event) => setDraft({ ...draft, javaPath: event.target.value || null })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Installed runtimes</Label>
                <Button variant="ghost" size="sm" onClick={() => void refreshJava()}>
                  <RefreshCw /> Rescan
                </Button>
              </div>
              {runtimes.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  No Java runtimes detected yet. Aether downloads the right one automatically on
                  first launch.
                </p>
              ) : (
                <ul className="space-y-2">
                  {runtimes.map((runtime) => (
                    <li
                      key={runtime.path}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3"
                    >
                      <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          Java {runtime.major} · {runtime.version}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{runtime.path}</p>
                      </div>
                      <Badge variant="muted">{runtime.vendor || runtime.source}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="space-y-2">
                <Label>Download runtime</Label>
                <Select value={installMajor} onValueChange={setInstallMajor}>
                  <SelectTrigger className="w-40">
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
              </div>
              <Button variant="outline" disabled={installing} onClick={handleInstallJava}>
                {installing ? <Spinner /> : <Cpu />} Install
              </Button>
            </div>
          </div>
        </Card>

        {/* Memory & JVM defaults */}
        <Card className="p-5">
          <SectionTitle icon={Monitor} title="Memory &amp; JVM defaults" />
          <Separator className="my-3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Default minimum memory (MB)</Label>
              <Input
                type="number"
                value={draft.defaultMemoryMin}
                onChange={(event) =>
                  setDraft({ ...draft, defaultMemoryMin: Number(event.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Default maximum memory (MB)</Label>
              <Input
                type="number"
                value={draft.defaultMemoryMax}
                onChange={(event) =>
                  setDraft({ ...draft, defaultMemoryMax: Number(event.target.value) || 0 })
                }
              />
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card className="p-5">
          <SectionTitle icon={Info} title="Modrinth &amp; authentication" />
          <Separator className="my-3" />
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Modrinth API URL</Label>
              <Input
                value={draft.modrinthApiUrl}
                onChange={(event) => setDraft({ ...draft, modrinthApiUrl: event.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Storage */}
        <Card className="p-5">
          <SectionTitle icon={FolderOpen} title="Storage" />
          <Separator className="my-3" />
          <ul className="space-y-2">
            {pathRows.map(([label, value]) =>
              value ? (
                <li key={label} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">{value}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Open"
                    onClick={() => void system.reveal(value)}
                  >
                    <FolderOpen />
                  </Button>
                </li>
              ) : null,
            )}
          </ul>
        </Card>

        {/* Updates */}
        <Card className="p-5">
          <SectionTitle icon={RefreshCw} title="Updates" />
          <Separator className="my-3" />
          {updateStatus === "downloading" && updateProgress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Downloading Aether {pendingUpdate?.version ?? ""}
                  {updateProgress.total ? "" : "…"}
                </span>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Aether {pendingUpdate?.version} is installed. Restart to finish the update.
              </p>
              <Button variant="brand" onClick={() => void relaunchApp()}>
                <RotateCcw /> Restart now
              </Button>
            </div>
          ) : updateStatus === "available" && pendingUpdate ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Aether {pendingUpdate.version} is available (you have {pendingUpdate.currentVersion}
                ).
              </p>
              <Button variant="brand" onClick={() => void installUpdate()}>
                <Download /> Download &amp; install
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {updateStatus === "checking" ? (
                  "Looking for a newer version…"
                ) : updateStatus === "up-to-date" ? (
                  <span className="text-foreground">
                    You're running the latest version ({appInfo?.version ?? "unknown"}).
                  </span>
                ) : updateStatus === "error" ? (
                  <span className="text-destructive">
                    {updateError ?? "Couldn't check for updates."}
                  </span>
                ) : (
                  "Check GitHub Releases for a newer version of Aether."
                )}
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
            Installing on another machine, or updating by hand?{" "}
            <InlineLink href={RELEASES_URL}>Download the latest release</InlineLink>
          </p>
        </Card>

        {/* About */}
        <Card className="p-5">
          <SectionTitle icon={Info} title="About" />
          <Separator className="my-3" />
          {appInfo ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <AboutRow label="Version" value={appInfo.version} />
              <AboutRow label="Platform" value={`${appInfo.os} · ${appInfo.arch}`} />
              <AboutRow label="Name" value={appInfo.name} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Loading environment info…</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Aether is free and open source under the MIT license. Downloaded assets and
            metadata are cached under the data directory shown above.
          </p>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

/** Small inline link that hands a URL to the OS browser. */
function InlineLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <button
      type="button"
      onClick={() => void system.openUrl(href)}
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function Toggle({
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
    <label className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
