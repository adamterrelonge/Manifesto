export type ViewMode = "map" | "list" | "cards";

const TABS: ViewMode[] = ["map", "list", "cards"];

interface HeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export default function Header({ view, onViewChange }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-8 font-jbmono dark:border-zinc-800">
      <p className="text-sm tracking-wide text-black dark:text-white">MANIFESTO</p>

      <div className="flex items-center gap-6">
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
