import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, PackagePlus, Play, Plus, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Spinner } from "@/components/common/Spinner";
import { InstanceCard } from "@/components/instances/InstanceCard";
import { InstanceIcon } from "@/components/instances/InstanceIcon";
import { NewInstanceDialog } from "@/components/instances/NewInstanceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLaunchInstance } from "@/hooks/useLaunchInstance";
import { formatDuration, loaderColor, loaderLabel, relativeTime } from "@/lib/format";
import { useInstances } from "@/store/useInstances";
import { useProgress } from "@/store/useProgress";
import { cn } from "@/lib/utils";

/** Landing screen: jump back into your most recent world or browse onward. */
export function Home() {
  const navigate = useNavigate();
  const instances = useInstances((state) => state.instances);
  const running = useProgress((state) => state.running);
  const { launchingId, launch } = useLaunchInstance();
  const [dialogOpen, setDialogOpen] = useState(false);

  const featured = instances[0] ?? null;
  const recent = useMemo(() => instances.slice(1, 5), [instances]);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8">
      <PageHeader
        title="Home"
        description="Welcome back to Aether."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/discover")}>
              <Compass /> Discover
            </Button>
            <Button variant="brand" onClick={() => setDialogOpen(true)}>
              <Plus /> New instance
            </Button>
          </>
        }
      />

      <div className="mt-8">
        {featured ? (
          <Card className="overflow-hidden">
            <div
              className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center"
              style={{ background: "linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)))" }}
            >
              <InstanceIcon
                icon={featured.icon}
                name={featured.name}
                id={featured.id}
                className="h-24 w-24 text-2xl"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Most recent
                </p>
                <h2 className="mt-1 truncate text-2xl font-semibold">{featured.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {featured.gameVersion}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(loaderColor(featured.loader))}
                  >
                    {loaderLabel(featured.loader)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {featured.modCount} mods · played {relativeTime(featured.lastPlayed)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => navigate(`/library/${featured.id}`)}>
                  Manage
                </Button>
                <Button
                  variant="brand"
                  size="lg"
                  disabled={launchingId === featured.id || running.includes(featured.id)}
                  onClick={() => void launch(featured.id)}
                >
                  {launchingId === featured.id ? (
                    <Spinner />
                  ) : (
                    <Play className="fill-current" />
                  )}
                  {running.includes(featured.id) ? "Running" : "Play"}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-semibold">No instances yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Create your first instance to start playing, or grab a modpack from
                Modrinth.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="brand" onClick={() => setDialogOpen(true)}>
                <PackagePlus /> Create instance
              </Button>
              <Button variant="outline" onClick={() => navigate("/discover")}>
                <Compass /> Browse modpacks
              </Button>
            </div>
          </Card>
        )}
      </div>

      {recent.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Jump back in</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/library")}>
              View all
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recent.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                running={running.includes(instance.id)}
                launching={launchingId === instance.id}
                onPlay={() => void launch(instance.id)}
              />
            ))}
          </div>
        </section>
      )}

      {featured && featured.playTimeSecs > 0 && (
        <p className="mt-8 text-xs text-muted-foreground">
          Total time in {featured.name}: {formatDuration(featured.playTimeSecs)}
        </p>
      )}

      <NewInstanceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
