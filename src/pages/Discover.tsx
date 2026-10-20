import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import {
  CARD_GRID,
  DEFAULT_VIEW,
  VIEW_KEY,
  ViewToggle,
  asViewMode,
  type ViewMode,
} from "@/components/common/ViewToggle";
import { ProjectCard, ProjectCardSkeleton } from "@/components/discover/ProjectCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersistentState } from "@/hooks/usePersistentState";
import { modrinth } from "@/lib/api";
import { loaderLabel, projectTypeLabel } from "@/lib/format";
import type { ModrinthTag, SearchFilters, SearchHit, SearchResponse } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const PROJECT_TYPES = ["mod", "modpack", "resourcepack", "shader", "datapack"] as const;
type ProjectType = (typeof PROJECT_TYPES)[number];
const SORTS = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "follows", label: "Followers" },
  { value: "newest", label: "Newest" },
  { value: "updated", label: "Recently updated" },
];
const CURSEFORGE_SORTS = SORTS.filter((option) =>
  ["relevance", "downloads", "updated"].includes(option.value),
);
type Source = "modrinth" | "curseforge";
const SOURCES: { value: Source; label: string }[] = [
  { value: "modrinth", label: "Modrinth" },
  { value: "curseforge", label: "CurseForge" },
];
const SOURCE_KEY = "aether.discover.source";
const PAGE_SIZE = 20;
const KNOWN_LOADERS = ["fabric", "quilt", "forge", "neoforge"];
const MAX_VERSIONS = 50;

function releaseVersions(tags: ModrinthTag[]): string[] {
  const releases = tags.filter((tag) => tag.versionType === "release");
  return (releases.length ? releases : tags).slice(0, MAX_VERSIONS).map((tag) => tag.name);
}

/** Unified Modrinth and CurseForge discovery. Search, filtering and paging remain backed by the current API. */
export function Discover() {
  const [projectType, setProjectType] = useState<ProjectType>("mod");
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState("any");
  const [loader, setLoader] = useState("any");
  const [sort, setSort] = useState("relevance");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [storedView, setStoredView] = usePersistentState<ViewMode>(VIEW_KEY, DEFAULT_VIEW);
  const view = asViewMode(storedView);
  const [storedSource, setStoredSource] = usePersistentState<Source>(SOURCE_KEY, "modrinth");
  const source: Source = storedSource === "curseforge" ? "curseforge" : "modrinth";
  const sorts = source === "curseforge" ? CURSEFORGE_SORTS : SORTS;
  const loaderApplies =
    projectType === "mod" || projectType === "modpack" || projectType === "datapack";
  const debounced = useDebounced(query, 350);
  const requestId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  function pickSource(next: Source) {
    setStoredSource(next);
    if (!(next === "curseforge" ? CURSEFORGE_SORTS : SORTS).some((item) => item.value === sort)) {
      setSort("relevance");
    }
  }

  useEffect(() => {
    void modrinth
      .tags("game_version")
      .then((tags) => setGameVersions(releaseVersions(tags)))
      .catch((error) => toast.error("Couldn't load game versions", { description: String(error) }));
  }, []);

  const filters = useMemo<SearchFilters>(
    () => ({
      query: debounced,
      projectType,
      gameVersion: gameVersion === "any" ? null : gameVersion,
      loader: loaderApplies && loader !== "any" ? loader : null,
      categories: [],
      index: sort,
    }),
    [debounced, projectType, gameVersion, loader, loaderApplies, sort],
  );

  const runSearch = useCallback(
    async (target: number) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const result: SearchResponse = await modrinth.search(
          filters,
          PAGE_SIZE,
          (target - 1) * PAGE_SIZE,
          source,
        );
        if (id !== requestId.current) return;
        setHits(result.hits);
        setTotal(result.totalHits);
        setPage(target);
      } catch (error) {
        if (id === requestId.current)
          toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters, source],
  );

  useEffect(() => {
    void runSearch(1);
  }, [runSearch]);

  const goToPage = useCallback(
    (target: number) => {
      void runSearch(target).then(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    [runSearch],
  );

  return (
    <div className="screen-page">
      <PageHeader
        title="Discover"
        description="Find the next thing to add to your game."
        actions={<ViewToggle view={view} onChange={setStoredView} label="Result layout" />}
      />

      <section className="discover-search mt-7 rounded-2xl border border-border/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Community content</p>
            <h2 className="mt-1 text-lg font-bold">Explore projects</h2>
          </div>
          <div className="source-switch" role="group" aria-label="Content source">
            {SOURCES.map((option) => (
              <button
                key={option.value}
                onClick={() => pickSource(option.value)}
                className={cn("source-option", source === option.value && "source-option-active")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {PROJECT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setProjectType(type)}
              className={cn("type-chip", projectType === type && "type-chip-active")}
            >
              {projectTypeLabel(type)}s
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${projectTypeLabel(projectType).toLowerCase()}s`}
              className="h-11 border-border/80 bg-background pl-11"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11 w-full bg-background sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="filter-panel rounded-2xl border border-border/80 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Filters
          </div>
          <label className="filter-label" htmlFor="discover-version">
            Game version
          </label>
          <Select value={gameVersion} onValueChange={setGameVersion}>
            <SelectTrigger id="discover-version" className="mt-1.5 w-full bg-background">
              <SelectValue placeholder="Any version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any version</SelectItem>
              {gameVersions.map((version) => (
                <SelectItem key={version} value={version}>
                  {version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loaderApplies && (
            <>
              <label className="filter-label mt-4" htmlFor="discover-loader">
                Mod loader
              </label>
              <Select value={loader} onValueChange={setLoader}>
                <SelectTrigger id="discover-loader" className="mt-1.5 w-full bg-background">
                  <SelectValue placeholder="Any loader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any loader</SelectItem>
                  {KNOWN_LOADERS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {loaderLabel(name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <p className="mt-4 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
            Results are from {source === "modrinth" ? "Modrinth" : "CurseForge"}. Choose a version
            or loader to narrow them down.
          </p>
        </aside>

        <section ref={resultsRef} className="min-w-0 scroll-mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {loading && hits.length === 0
                ? "Finding projects…"
                : `${total.toLocaleString()} projects`}
            </p>
            {loading && hits.length > 0 && (
              <span className="text-xs text-muted-foreground">Updating results…</span>
            )}
          </div>
          {loading && hits.length === 0 ? (
            <div className={view === "grid" ? CARD_GRID : "space-y-3"}>
              {Array.from({ length: 6 }).map((_, index) => (
                <ProjectCardSkeleton key={index} layout={view} />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="Nothing found"
              description="Try another search or loosen your filters."
            />
          ) : (
            <>
              <div className={view === "grid" ? CARD_GRID : "space-y-3"}>
                {hits.map((hit) => (
                  <ProjectCard
                    key={`${hit.projectId}-${hit.latestVersion ?? ""}`}
                    hit={hit}
                    layout={view}
                  />
                ))}
              </div>
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                pageSize={PAGE_SIZE}
                loading={loading}
                onChange={goToPage}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
