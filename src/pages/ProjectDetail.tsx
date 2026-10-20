import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bug, Download, ExternalLink, Github, Globe, Heart } from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { Markdown } from "@/components/common/Markdown";
import { InstallDialog } from "@/components/discover/InstallDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { modrinth, system } from "@/lib/api";
import { compactNumber, projectTypeColor, projectTypeLabel, relativeTime } from "@/lib/format";
import type { ModrinthProject, ModrinthVersion } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** Detailed community-project view. Project metadata, gallery and install flow remain unchanged. */
export function ProjectDetail() {
  const { id } = useParams<{ projectType: string; id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([modrinth.project(id), modrinth.versions(id).catch(() => [])])
      .then(([nextProject, nextVersions]) => {
        if (cancelled) return;
        setProject(nextProject);
        setVersions(nextVersions);
        setGalleryIndex(0);
      })
      .catch((cause) => !cancelled && setError(cause))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="screen-page space-y-5">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-52 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="screen-page">
        <Button variant="ghost" className="mb-5" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        <ErrorState title="Couldn't load this project" error={error ?? "Not found"} />
      </div>
    );
  }

  const gallery = project.gallery;
  const activeImage = gallery[galleryIndex];
  const isCurseForge = id?.startsWith("cf:") ?? false;

  return (
    <div className="screen-page">
      <Button variant="ghost" size="sm" className="mb-5 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft /> Back to discovery
      </Button>

      <section className="project-cover relative overflow-hidden rounded-3xl border border-border/80">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_82%_0%,hsl(var(--primary)/0.12),transparent_38%)]" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
          <div className="project-logo h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-muted">
            {project.iconUrl ? (
              <img
                src={project.iconUrl}
                alt={project.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-3xl font-bold text-muted-foreground">
                {project.title.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("project-kind", projectTypeColor(project.projectType))}>
                {projectTypeLabel(project.projectType)}
              </span>
              {isCurseForge && <span className="project-kind">CurseForge</span>}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{project.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" /> {compactNumber(project.downloads)} downloads
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" /> {compactNumber(project.followers)} followers
              </span>
              {project.updated && <span>Updated {relativeTime(project.updated)}</span>}
              {project.license && <span>{project.license.name || project.license.id}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
            <Button variant="brand" size="lg" onClick={() => setInstallOpen(true)}>
              <Download /> Install
            </Button>
            <div className="flex justify-center gap-1">
              {project.sourceUrl && (
                <IconLink label="Source" url={project.sourceUrl} icon={Github} />
              )}
              {project.issuesUrl && <IconLink label="Issues" url={project.issuesUrl} icon={Bug} />}
              {project.wikiUrl && <IconLink label="Wiki" url={project.wikiUrl} icon={Globe} />}
            </div>
          </div>
        </div>
      </section>

      {gallery.length > 0 && activeImage && (
        <section className="mt-5">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
            <img
              src={activeImage.url}
              alt={activeImage.title ?? project.title}
              className="max-h-[440px] w-full object-cover"
            />
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((image, index) => (
                <button
                  key={image.url}
                  onClick={() => setGalleryIndex(index)}
                  aria-label={`Show screenshot ${index + 1}`}
                  className={cn(
                    "h-16 w-28 shrink-0 overflow-hidden rounded-lg border-2",
                    index === galleryIndex
                      ? "border-primary"
                      : "border-transparent opacity-60 hover:opacity-100",
                  )}
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 rounded-2xl p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
            <h2 className="text-lg font-bold">About this project</h2>
            <span className="text-xs text-muted-foreground">
              {project.versions.length} versions
            </span>
          </div>
          {project.body ? (
            <Markdown>{project.body}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </Card>
        <aside className="space-y-4">
          <Card className="rounded-2xl p-5">
            <h2 className="font-bold">Project details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              {project.clientSide && <DetailRow label="Client" value={project.clientSide} />}
              {project.serverSide && <DetailRow label="Server" value={project.serverSide} />}
              <DetailRow label="Published" value={relativeTime(project.published)} />
              <DetailRow
                label="License"
                value={project.license?.name || project.license?.id || "Not listed"}
              />
            </dl>
          </Card>
          <Card className="rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Latest versions</h2>
              <span className="text-xs text-muted-foreground">{versions.length}</span>
            </div>
            {versions.length ? (
              <ul className="mt-4 divide-y divide-border/70">
                {versions.slice(0, 8).map((version) => (
                  <li key={version.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="truncate text-sm font-semibold">
                      {version.versionNumber || version.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {version.loaders.join(", ") || "All loaders"} ·{" "}
                      {relativeTime(version.datePublished)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No versions listed.</p>
            )}
          </Card>
          {project.sourceUrl && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void system.openUrl(project.sourceUrl!)}
            >
              <ExternalLink /> View project page
            </Button>
          )}
        </aside>
      </div>

      {installOpen && (
        <InstallDialog open={installOpen} onOpenChange={setInstallOpen} project={project} />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}

function IconLink({ url, label, icon: Icon }: { url: string; label: string; icon: typeof Github }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      onClick={() => void system.openUrl(url)}
    >
      <Icon />
    </Button>
  );
}
