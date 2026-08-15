export type ViewMode = "map" | "list" | "cards";

const TABS: ViewMode[] = ["map", "list", "cards"];

interface HeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export default function Header({ view, onViewChange, searchQuery, onSearchQueryChange }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 px-8 font-jbmono dark:border-zinc-800">
      <p className="shrink-0 text-sm tracking-wide text-black dark:text-white">MANIFESTO</p>

      <div className="flex flex-1 justify-center">
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
