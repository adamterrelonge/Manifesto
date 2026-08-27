interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

// Numbered window (max 7 slots incl. first/last) around the current page,
// e.g. [1, "…", 4, 5, 6, "…", 12] — collapses to a plain run when the whole
// range already fits without an ellipsis.
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const first = 1;
  const last = totalPages;
  const start = Math.max(first + 1, page - 1);
  const end = Math.min(last - 1, page + 1);

  const pages: (number | "…")[] = [first];
  if (start > first + 1) pages.push("…");
  for (let n = start; n <= end; n++) pages.push(n);
  if (end < last - 1) pages.push("…");
  pages.push(last);
  return pages;
}

export default function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalItems === 0 || totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const buttonClass =
    "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800";
  const activeButtonClass =
    "flex h-8 min-w-8 items-center justify-center rounded-md bg-[#1f271a] px-2 text-sm font-medium text-white dark:bg-white dark:text-black";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center gap-3 border-t border-zinc-200 px-4 py-6 sm:flex-row sm:justify-between sm:px-6 dark:border-zinc-800"
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Showing {start}–{end} of {totalItems} events
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={buttonClass}
          aria-label="Previous page"
        >
          Prev
        </button>
        {pageWindow(page, totalPages).map((n, i) =>
          n === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm text-zinc-400 dark:text-zinc-600">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={n === page ? activeButtonClass : buttonClass}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={buttonClass}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
