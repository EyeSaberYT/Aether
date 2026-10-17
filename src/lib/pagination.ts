/** Page-window helpers for paginated result lists. */

/** A page button, or an ellipsis standing in for a skipped run of pages. */
export type PageToken = number | "gap";

/**
 * Which page numbers to render for a pager: always the first and last page,
 * plus a window of `span` pages either side of the current one. Ellipses fill
 * the gaps, so a 400-page result set renders as
 * `[1, "gap", 8, 9, 10, 11, 12, "gap", 400]` rather than 400 buttons.
 */
export function pageWindow(current: number, totalPages: number, span = 2): PageToken[] {
  const pages = new Set<number>([1, totalPages]);
  for (let page = current - span; page <= current + span; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const tokens: PageToken[] = [];
  let previous = 0;
  for (const page of [...pages].sort((a, b) => a - b)) {
    // `previous` starts at 0 so the first page never gets a leading ellipsis.
    if (page - previous > 1) tokens.push("gap");
    tokens.push(page);
    previous = page;
  }
  return tokens;
}

/**
 * The `[first, last]` result positions shown on `page`, clamped to `total`.
 * An empty result set reports `0..0` so callers can skip the summary line.
 */
export function pageRange(page: number, pageSize: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  return [(page - 1) * pageSize + 1, Math.min(page * pageSize, total)];
}
