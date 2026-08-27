// Ghost/skeleton placeholders shown while a page/filter/view change is
// pending (see AppShell's useTransition + useDeferredValue) — matches the
// real card/row markup in CardsView/EventsListView so the layout doesn't
// jump once the content swaps in.

const PULSE = "animate-pulse rounded bg-zinc-100 dark:bg-zinc-900";

export function CardsSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 px-6 py-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden="true"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-zinc-100 dark:bg-zinc-900" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className={`h-3 w-1/3 ${PULSE}`} />
            <div className={`h-4 w-4/5 ${PULSE}`} />
            <div className={`h-3 w-2/3 ${PULSE}`} />
            <div className={`mt-auto h-3 w-1/4 ${PULSE}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 15 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3 px-4 py-6 sm:px-6" aria-hidden="true" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-4 rounded-2xl bg-white/80 px-4 py-4 dark:bg-zinc-900/60 sm:px-5 sm:py-5"
        >
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`h-3.5 w-2/5 ${PULSE}`} />
            <div className={`h-3 w-1/3 ${PULSE}`} />
            <div className={`h-3 w-1/2 ${PULSE}`} />
          </div>
          <div className={`h-3 w-10 shrink-0 ${PULSE}`} />
        </li>
      ))}
    </ul>
  );
}
