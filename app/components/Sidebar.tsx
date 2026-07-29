"use client";

import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  FilterIcon,
  ConnectionsIcon,
  FavouritesIcon,
  NotificationsIcon,
  SettingsIcon,
  ShuffleIcon,
  GappedArrowIcon,
} from "@/app/components/icons";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BUCKET_LABELS, NON_QUALIFYING_BUCKETS, type BucketSlug } from "@/lib/buckets";

interface SidebarItem {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Filter", icon: FilterIcon },
  { label: "Connections", icon: ConnectionsIcon },
  { label: "Favourites", icon: FavouritesIcon },
  { label: "Notifications", icon: NotificationsIcon },
  { label: "Settings", icon: SettingsIcon },
  { label: "Shuffle", icon: ShuffleIcon },
];

export type DateFilter = "today" | "tomorrow" | "week";

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This Week" },
];

export interface FilterState {
  maxPrice: number | null; // null = no limit
  categories: Category[]; // empty = all
  buckets: BucketSlug[]; // empty = all
}

export const DEFAULT_FILTERS: FilterState = {
  maxPrice: null,
  categories: [],
  buckets: [],
};

const MAX_PRICE_CAP = 100;

// Cost is already covered by the price slider — these describe access/cost,
// not community, so they're left out of the Community checkbox list.
const COMMUNITY_BUCKET_ENTRIES = (Object.entries(BUCKET_LABELS) as [BucketSlug, string][]).filter(
  ([slug]) => !NON_QUALIFYING_BUCKETS.includes(slug)
);

interface SidebarProps {
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export default function Sidebar({
  dateFilter,
  onDateFilterChange,
  filters,
  onFiltersChange,
}: SidebarProps) {
  const [activeItem, setActiveItem] = useState<string | null>(null);

  return (
    <aside className="w-80 shrink-0 overflow-hidden bg-[#ffffff] px-8 py-6 font-jbmono text-[#1f271a]">
      <div className="flex items-center gap-6 text-sm tracking-wide">
        {DATE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onDateFilterChange(option.value)}
            className={
              dateFilter === option.value
                ? "underline underline-offset-4"
                : "text-[#1f271a]/50 hover:text-[#1f271a]"
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative mt-10 overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: activeItem ? "translateX(-100%)" : "translateX(0%)" }}
        >
          {/* Primary options */}
          <nav className="flex w-full shrink-0 flex-col gap-5 pr-1">
            {SIDEBAR_ITEMS.map(({ label, icon: Icon }, index) => {
              const isLast = index === SIDEBAR_ITEMS.length - 1;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveItem(label)}
                  className="group flex cursor-pointer items-center gap-2 whitespace-nowrap text-left text-[#1f271a]/55 transition-colors duration-200 hover:text-[#1f271a]"
                >
                  <span aria-hidden className="select-none text-2m leading-none">
                    {isLast ? "└──" : "├──"}
                  </span>
                  <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                  <span className="text-2m flex gap-6">{label}</span>
                  {!isLast && <GappedArrowIcon aria-hidden className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </nav>

          {/* Detail panel — takes over the full width when an option is selected */}
          <div className="w-full shrink-0 pl-1">
            <button
              type="button"
              onClick={() => setActiveItem(null)}
              className="flex cursor-pointer items-center gap-2 text-sm text-[#1f271a]/55 transition-colors duration-200 hover:text-[#1f271a]"
            >
              <span aria-hidden>←</span> Back
            </button>

            <div className="mt-4">
              {activeItem === "Filter" && (
                <div className="flex flex-col gap-5 text-sm normal-case tracking-normal">
                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                      <span aria-hidden className="select-none normal-case">
                        ├──
                      </span>
                      Price
                    </h3>
                    <div className="mt-2 flex items-center gap-2 pl-5">
                      <input
                        type="range"
                        min={0}
                        max={MAX_PRICE_CAP}
                        step={5}
                        value={filters.maxPrice ?? MAX_PRICE_CAP}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          onFiltersChange({
                            ...filters,
                            maxPrice: value >= MAX_PRICE_CAP ? null : value,
                          });
                        }}
                        className="w-full"
                      />
                      <span className="whitespace-nowrap text-xs">
                        {filters.maxPrice === null ? "Any" : `≤ £${filters.maxPrice}`}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                      <span aria-hidden className="select-none normal-case">
                        ├──
                      </span>
                      Category
                    </h3>
                    <div className="mt-2 flex flex-col gap-1.5 pl-5">
                      {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(
                        ([slug, catLabel]) => (
                          <label key={slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.categories.includes(slug)}
                              onChange={() => {
                                const next = filters.categories.includes(slug)
                                  ? filters.categories.filter((c) => c !== slug)
                                  : [...filters.categories, slug];
                                onFiltersChange({ ...filters, categories: next });
                              }}
                            />
                            {catLabel}
                          </label>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                      <span aria-hidden className="select-none normal-case">
                        └──
                      </span>
                      Community
                    </h3>
                    <div className="mt-2 flex flex-col gap-1.5 pl-5">
                      {COMMUNITY_BUCKET_ENTRIES.map(([slug, bucketLabel]) => (
                        <label key={slug} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters.buckets.includes(slug)}
                            onChange={() => {
                              const next = filters.buckets.includes(slug)
                                ? filters.buckets.filter((b) => b !== slug)
                                : [...filters.buckets, slug];
                              onFiltersChange({ ...filters, buckets: next });
                            }}
                          />
                          {bucketLabel}
                        </label>
                      ))}
                    </div>
                  </div>

                  {(filters.maxPrice !== null ||
                    filters.categories.length > 0 ||
                    filters.buckets.length > 0) && (
                    <button
                      type="button"
                      onClick={() => onFiltersChange(DEFAULT_FILTERS)}
                      className="self-start text-xs underline underline-offset-4"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {activeItem && activeItem !== "Filter" && (
                <p className="text-sm normal-case tracking-normal text-[#1f271a]/60">
                  Coming soon.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
