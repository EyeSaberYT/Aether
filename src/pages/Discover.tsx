import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ProjectCard, ProjectCardSkeleton } from "@/components/discover/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { modrinth } from "@/lib/api";
import { projectTypeLabel } from "@/lib/format";
import type { SearchFilters, SearchHit, SearchResponse } from "@/lib/tauri";
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

/** Modrinth search: type tabs, filters and an infinite-ish result grid. */
export function Discover() {
  const [projectType, setProjectType] = useState<ProjectType>("mod");
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState("any");
  const [loader, setLoader] = useState("any");
  const [sort, setSort] = useState("relevance");

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gameVersions, setGameVersions] = useState<string[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);

  // Whether the loader filter is meaningful for the current project type.
  const loaderApplies = projectType === "mod" || projectType === "modpack" || projectType === "datapack";

  // Debounced search term so typing doesn't hammer the API.
  const debounced = useDebounced(query, 350);
  const requestId = useRef(0);

  // Load filter option lists once.
  useEffect(() => {
    void modrinth
      .tags("game_version")
      .then((tags) => setGameVersions(tags.map((tag) => tag.name).slice(0, 60)))
      .catch(() => {});
    void modrinth
      .tags("loader")
      .then((tags) => setLoaders(tags.map((tag) => tag.name)))
      .catch(() => {});
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
    async (append: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const response: SearchResponse = await modrinth.search(
          filters,
          PAGE_SIZE,
          append ? offset : 0,
        );
        if (id !== requestId.current) return;
        setHits((current) => (append ? [...current, ...response.hits] : response.hits));
        setTotal(response.totalHits);
        setOffset((append ? offset : 0) + response.hits.length);
      } catch (error) {
        if (id === requestId.current) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters, offset],
  );

  // Re-run whenever the filters change (resetting pagination).
  useEffect(() => {
    setOffset(0);
    void runSearch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <PageHeader
        title="Discover"
        description="Browse mods, modpacks, resource packs, shaders and datapacks from Modrinth."
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
                {loaders.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
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
      <div className="mt-6 space-y-3">
        {loading && hits.length === 0 ? (
          Array.from({ length: 6 }).map((_, index) => <ProjectCardSkeleton key={index} />)
        ) : hits.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No projects found"
            description="Try changing your search or filters."
          />
        ) : (
          <>
            {hits.map((hit) => (
              <ProjectCard key={`${hit.projectId}-${hit.latestVersion ?? ""}`} hit={hit} />
            ))}
            {hits.length < total && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => void runSearch(true)}
                >
                  {loading ? "Loading…" : `Load more (${total - hits.length} left)`}
                </Button>
              </div>
            )}
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
