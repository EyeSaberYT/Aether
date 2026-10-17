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

const PAGE_SIZE = 20;

/**
 * The loaders worth filtering by. Modrinth's `tag/loader` endpoint also lists
 * long-dead loaders (Rift, Liteloader, modloader) and server software (Paper,
 * Spigot…) that a client launcher can't use, so the filter is pinned to the
 * four loaders Aether can actually install.
 */
const KNOWN_LOADERS = ["fabric", "quilt", "forge", "neoforge"];

/** How many game versions the filter offers. */
const MAX_VERSIONS = 50;

/**
 * Modrinth returns every game version it knows about, and the vast majority of
 * those are snapshots (about 750, against ~100 releases). A launch target is
 * almost always a release, so drop the pre-releases and keep the newest
 * releases, which arrive newest-first.
 */
function releaseVersions(tags: ModrinthTag[]): string[] {
  const releases = tags.filter((tag) => tag.versionType === "release");
  // If Modrinth ever stops labelling version types, showing everything beats
  // showing nothing.
  const usable = releases.length > 0 ? releases : tags;
  return usable.slice(0, MAX_VERSIONS).map((tag) => tag.name);
}

/** Modrinth search: type tabs, filters and an infinite-ish result grid. */
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
  // Storage is user-writable, so narrow it before it reaches a branch.
  const view = asViewMode(storedView);

  // Whether the loader filter is meaningful for the current project type.
  const loaderApplies =
    projectType === "mod" || projectType === "modpack" || projectType === "datapack";

  // Debounced search term so typing doesn't hammer the API.
  const debounced = useDebounced(query, 350);
  const requestId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load the game-version list once. It only fills a dropdown, so a failure
  // degrades the filter rather than blocking the page. The loader options are
  // a fixed list (see KNOWN_LOADERS), so nothing else needs fetching.
  useEffect(() => {
    void (async () => {
      try {
        setGameVersions(releaseVersions(await modrinth.tags("game_version")));
      } catch (error) {
        toast.error("Couldn't load search filters", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    })();
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
        const response: SearchResponse = await modrinth.search(
          filters,
          PAGE_SIZE,
          (target - 1) * PAGE_SIZE,
        );
        // A newer request superseded this one while it was in flight.
        if (id !== requestId.current) return;
        setHits(response.hits);
        setTotal(response.totalHits);
        setPage(target);
      } catch (error) {
        if (id === requestId.current) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters],
  );

  // Re-run whenever the filters change (always from the first page).
  useEffect(() => {
    void runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Jump to a page and return to the top of the results, the way every
  // paginated site behaves — without this, clicking "Next" on a long page
  // leaves you staring at cards that just changed underneath you.
  const goToPage = useCallback(
    (target: number) => {
      void runSearch(target).then(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [runSearch],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <PageHeader
        title="Discover"
        description="Browse mods, modpacks, resource packs, shaders and datapacks from Modrinth."
        actions={<ViewToggle view={view} onChange={setStoredView} label="Discover layout" />}
      />

      {/* Type tabs */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {PROJECT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setProjectType(type)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              projectType === type
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {projectTypeLabel(type)}s
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${projectTypeLabel(projectType).toLowerCase()}s…`}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-3">
          <SlidersHorizontal className="hidden h-4 w-4 text-muted-foreground lg:block" />

          <Select value={gameVersion} onValueChange={setGameVersion}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Version" />
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
            <Select value={loader} onValueChange={setLoader}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Loader" />
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
          )}

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      <div ref={resultsRef} className="mt-6 scroll-mt-8">
        {loading && hits.length === 0 ? (
          <div className={view === "grid" ? CARD_GRID : "space-y-3"}>
            {Array.from({ length: 6 }).map((_, index) => (
              <ProjectCardSkeleton key={index} layout={view} />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No projects found"
            description="Try changing your search or filters."
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
      </div>
    </div>
  );
}

/** Returns `value` after it has stayed unchanged for `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
