import { FilterIcon } from "@/app/components/icons";

export type ViewMode = "map" | "list" | "cards";

const TABS: ViewMode[] = ["map", "list", "cards"];

interface HeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onMenuClick: () => void;
}

export default function Header({
  view,
  onViewChange,
  searchQuery,
  onSearchQueryChange,
  onMenuClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 font-jbmono md:px-8 dark:border-zinc-800 dark:bg-black">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open filters"
        className="shrink-0 text-zinc-600 hover:text-black md:hidden dark:text-zinc-400 dark:hover:text-white"
      >
        <FilterIcon className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {/* Absolutely centered below `md` — a fixed offset (left-1/2 +
          -translate-x-1/2) is exact regardless of how wide the button/tabs
          either side are, unlike flex/grid centering tricks which only
          center correctly when both sides are equal width (they aren't
          here). `sticky` on the header above still provides the
          containing block this positions against. At `md`+ this reverts
          to a normal static, left-aligned flex item, same as before. */}
      <p className="absolute left-1/2 -translate-x-1/2 shrink-0 whitespace-nowrap text-sm tracking-wide text-black md:static md:left-auto md:translate-x-0 dark:text-white">
        MANIFESTO
      </p>

      {/* Hidden below `md` entirely, not just shrunk — there's no room for
          a usable search box alongside the logo/tabs on a phone screen. */}
      <div className="hidden md:flex md:flex-1 md:justify-center">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search events, venues…"
          aria-label="Search events and venues"
          className="w-full max-w-xs rounded-md border border-zinc-200 bg-transparent px-3 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:text-white dark:placeholder:text-zinc-600"
        />
      </div>

      <div className="flex shrink-0 items-center gap-6">
        {TABS.map((tab) => {
          const isActive = tab === view;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onViewChange(tab)}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "text-sm uppercase tracking-wide text-black underline underline-offset-4 dark:text-white"
                  : "text-sm uppercase tracking-wide text-zinc-500 hover:text-black dark:hover:text-white"
              }
            >
              {tab}
            </button>
          );
        })}
      </div>
    </header>
  );
}
