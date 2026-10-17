import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pageRange, pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onChange: (page: number) => void;
}

/**
 * Numbered page controls for a result list, with a "showing X–Y of Z" summary.
 * While a page is loading the buttons stay disabled so double-clicks can't
 * fire two requests; the request guard in the caller drops stale responses.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  loading,
  onChange,
}: PaginationProps) {
  const [first, last] = pageRange(page, pageSize, total);

  return (
    <div className="flex flex-col items-center gap-3 pt-6">
      <p className="text-xs text-muted-foreground">
        Showing {first.toLocaleString("en")}–{last.toLocaleString("en")} of{" "}
        {total.toLocaleString("en")} results
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft /> Previous
        </Button>

        {pageWindow(page, pageCount).map((token, index) =>
          token === "gap" ? (
            // Keys don't matter for a rerender-everything list, but a stable
            // shape keeps React from reusing the wrong button between pages.
            <span key={`gap-${index}`} className="px-1.5 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={token}
              variant={token === page ? "brand" : "ghost"}
              size="sm"
              disabled={loading}
              className={cn("min-w-8 px-2", token === page && "pointer-events-none")}
              onClick={() => onChange(token)}
            >
              {token}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={loading || page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
