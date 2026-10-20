import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Box,
  Clock3,
  Compass,
  Gamepad2,
  Play,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Spinner } from "@/components/common/Spinner";
import { CARD_GRID } from "@/components/common/ViewToggle";
import { InstanceCard } from "@/components/instances/InstanceCard";
import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { NewInstanceDialog } from "@/components/instances/NewInstanceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLaunchInstance } from "@/hooks/useLaunchInstance";
import { usePersistentState } from "@/hooks/usePersistentState";
import { formatDuration, loaderColor, loaderLabel, relativeTime } from "@/lib/format";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";
import { cn } from "@/lib/utils";

/** Launcher dashboard. The underlying instance and launch flows stay in their existing stores. */
export function Home() {
  const navigate = useNavigate();
  const instances = useInstances((state) => state.instances);
  const running = useProgress((state) => state.running);
  const { launchingId, launch } = useLaunchInstance();
  const [createOpen, setCreateOpen] = useState(false);
  const [dismissedGuide, setDismissedGuide] = usePersistentState(
    "aether.home.beginner-guide-dismissed",
    false,
  );

  const featured = instances[0] ?? null;
  const runningCount = instances.filter((instance) => running.includes(instance.id)).length;
  const totalMods = instances.reduce((count, instance) => count + instance.modCount, 0);

  return (
    <div className="screen-page">
      <PageHeader
        title="Your launcher"
        description="Everything you need to get back into the game."
        actions={
          <Button variant="brand" onClick={() => setCreateOpen(true)}>
            <Plus /> Create instance
          </Button>
        }
      />

      {!dismissedGuide && (
        <section className="beginner-guide mt-6" aria-label="Getting started guide">
          <div className="beginner-guide-heading">
            <span className="beginner-guide-icon">
              <BookOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">New to Aether?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Three quick steps to get your Minecraft setup ready.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss getting started guide"
              className="guide-dismiss"
              onClick={() => setDismissedGuide(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="beginner-guide-steps">
            <GuideStep
              number="01"
              title="Create a setup"
              description="Choose a Minecraft version and loader."
              action="Create instance"
              onClick={() => setCreateOpen(true)}
            />
            <GuideStep
              number="02"
              title="Add something new"
              description="Find mods, shaders and modpacks."
              action="Browse projects"
              onClick={() => navigate("/discover")}
            />
            <GuideStep
              number="03"
              title="Jump in"
              description={
                featured ? `Launch ${featured.name}.` : "Your first instance will appear here."
              }
              action={
                featured ? (running.includes(featured.id) ? "Running" : "Play now") : "View library"
              }
              disabled={!featured || running.includes(featured.id)}
              onClick={() => (featured ? void launch(featured.id) : navigate("/library"))}
            />
          </div>
        </section>
      )}

      {featured ? (
        <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
          <Card className="play-spotlight relative min-h-[290px] overflow-hidden border-primary/15 p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-12 -top-24 h-80 w-80 rounded-full bg-primary/[0.11] blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div className="flex items-start gap-5">
                <InstanceIcon
                  icon={featured.icon}
                  name={featured.name}
                  id={featured.id}
                  className="h-[72px] w-[72px] shrink-0 rounded-2xl text-2xl ring-1 ring-white/10"
                />
                <div className="min-w-0 pt-1">
                  <p className="eyebrow text-primary">Continue playing</p>
                  <h2 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">
                    {featured.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {featured.gameVersion}
                    </Badge>
                    <Badge variant="outline" className={cn(loaderColor(featured.loader))}>
                      {loaderLabel(featured.loader)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {featured.modCount} {featured.modCount === 1 ? "mod" : "mods"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
                <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-4 w-4" /> Last played {relativeTime(featured.lastPlayed)}
                  {featured.playTimeSecs > 0 && (
                    <span>· {formatDuration(featured.playTimeSecs)} total</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate(`/library/${featured.id}`)}>
                    Manage
                  </Button>
                  <Button
                    variant="brand"
                    disabled={launchingId === featured.id || running.includes(featured.id)}
                    onClick={() => void launch(featured.id)}
                  >
                    {launchingId === featured.id ? <Spinner /> : <Play className="fill-current" />}
                    {running.includes(featured.id) ? "Running" : "Play"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
            <DashboardStat icon={Box} label="Instances" value={instances.length} />
            <DashboardStat icon={Gamepad2} label="Mods installed" value={totalMods} />
            <DashboardStat
              icon={Play}
              label="Playing"
              value={runningCount}
              active={runningCount > 0}
            />
          </div>
        </section>
      ) : (
        <Card className="mt-8 flex min-h-[320px] items-center overflow-hidden border-primary/15 p-7 sm:p-10">
          <div className="relative max-w-2xl">
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="eyebrow text-primary">A fresh start</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Make Minecraft yours.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Build an instance for vanilla play, explore a modpack, or bring your setup over from
              another launcher.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="brand" onClick={() => setCreateOpen(true)}>
                <Plus /> Create instance
              </Button>
              <Button variant="outline" onClick={() => navigate("/discover")}>
                <Compass /> Explore projects
              </Button>
            </div>
          </div>
        </Card>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Your collection</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">Recent instances</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/library")}>
            Open library <ArrowRight />
          </Button>
        </div>

        {instances.length ? (
          <div className={CARD_GRID}>
            {instances.slice(0, 4).map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                running={running.includes(instance.id)}
                launching={launchingId === instance.id}
                onPlay={() => void launch(instance.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="quick-action" onClick={() => setCreateOpen(true)}>
              <span className="quick-action-icon">
                <Plus />
              </span>
              <span>
                <b>Create an instance</b>
                <small>Choose a game version and loader</small>
              </span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </button>
            <button className="quick-action" onClick={() => navigate("/discover")}>
              <span className="quick-action-icon">
                <Compass />
              </span>
              <span>
                <b>Explore mods</b>
                <small>Browse projects and modpacks</small>
              </span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      <NewInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function GuideStep({
  number,
  title,
  description,
  action,
  onClick,
  disabled = false,
}: {
  number: string;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="guide-step">
      <span className="guide-step-number">{number}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">{title}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onClick}>
        {action} <ArrowRight />
      </Button>
    </div>
  );
}

function DashboardStat({
  icon: Icon,
  label,
  value,
  active = false,
}: {
  icon: typeof Box;
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 border-border/70 bg-card/75 p-4 xl:flex-1">
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground",
          active && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <small className="block truncate text-[11px] text-muted-foreground">{label}</small>
        <b className="text-lg tabular-nums">{value.toLocaleString()}</b>
      </span>
    </Card>
  );
}
