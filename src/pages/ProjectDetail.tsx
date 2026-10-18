import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bug,
  Download,
  ExternalLink,
  Github,
  Globe,
  Heart,
} from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { Markdown } from "@/components/common/Markdown";
import { InstallDialog } from "@/components/discover/InstallDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { modrinth, system } from "@/lib/api";
import { compactNumber, projectTypeColor, projectTypeLabel, relativeTime } from "@/lib/format";
import type { ModrinthProject, ModrinthVersion } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** Modrinth or CurseForge project page with description, gallery and versions. */
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
      })
      .catch((cause) => !cancelled && setError(cause))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-8 py-8">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-5">
          <Skeleton className="h-24 w-24 rounded-xl" />
          <div className="flex-1 space-y-3 py-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        <ErrorState title="Couldn't load this project" error={error ?? "Not found"} />
      </div>
    );
  }

  const gallery = project.gallery;
  const activeImage = gallery[galleryIndex];

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft /> Back to results
      </Button>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
          {project.iconUrl ? (
            <img src={project.iconUrl} alt={project.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
              {project.title.slice(0, 1)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <Badge variant="outline" className={cn(projectTypeColor(project.projectType))}>
              {projectTypeLabel(project.projectType)}
            </Badge>
            {id?.startsWith("cf:") && <Badge variant="muted">CurseForge</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="h-3.5 w-3.5" /> {compactNumber(project.downloads)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" /> {compactNumber(project.followers)}
            </span>
            {project.updated && <span>Updated {relativeTime(project.updated)}</span>}
            {project.license && <span>{project.license.name || project.license.id}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button variant="brand" onClick={() => setInstallOpen(true)}>
            <Download /> Install
          </Button>
          <div className="flex gap-1">
            {project.sourceUrl && (
              <IconLink label="Source" url={project.sourceUrl} icon={Github} />
            )}
            {project.issuesUrl && <IconLink label="Issues" url={project.issuesUrl} icon={Bug} />}
            {project.wikiUrl && <IconLink label="Wiki" url={project.wikiUrl} icon={Globe} />}
          </div>
        </div>
      </div>

      {gallery.length > 0 && activeImage && (
        <div className="mt-6">
          <div className="overflow-hidden rounded-xl border bg-muted">
            <img src={activeImage.url} alt={activeImage.title ?? project.title} className="w-full" />
          </div>
          {gallery.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((item, index) => (
                <button
                  key={item.url}
                  onClick={() => setGalleryIndex(index)}
                  className={cn(
                    "h-14 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                    index === galleryIndex ? "border-primary" : "border-transparent opacity-70",
                  )}
                >
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">About</h2>
          <Separator className="my-4" />
          {project.body ? (
            <Markdown>{project.body}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Details</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {project.clientSide && (
                <DetailRow label="Client" value={project.clientSide} />
              )}
              {project.serverSide && (
                <DetailRow label="Server" value={project.serverSide} />
              )}
              <DetailRow label="Published" value={relativeTime(project.published)} />
              <DetailRow label="Versions" value={`${project.versions.length}`} />
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Versions</h3>
            {versions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No versions listed.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {versions.slice(0, 8).map((version) => (
                  <li key={version.id} className="text-sm">
                    <p className="truncate font-medium">
                      {version.versionNumber || version.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {version.loaders.join(", ") || "—"} ·{" "}
                      {relativeTime(version.datePublished)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {installOpen && (
        <InstallDialog open={installOpen} onOpenChange={setInstallOpen} project={project} />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate capitalize">{value}</dd>
    </div>
  );
}

function IconLink({
  url,
  label,
  icon: Icon,
}: {
  url: string;
  label: string;
  icon: typeof Github;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      title={label}
      onClick={() => void system.openUrl(url)}
    >
      <Icon />
      <ExternalLink className="sr-only" />
    </Button>
  );
}
