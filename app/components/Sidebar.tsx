"use client";

import { useState } from "react";
import {
  ListFilter,
  Users,
  Heart,
  Bell,
  Settings as SettingsIcon,
  Dice5,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BUCKET_LABELS, type BucketSlug } from "@/lib/buckets";

interface SidebarItem {
  label: string;
  icon: LucideIcon;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Filter", icon: ListFilter },
  { label: "Connections", icon: Users },
  { label: "Favourites", icon: Heart },
  { label: "Notifications", icon: Bell },
  { label: "Settings", icon: SettingsIcon },
  { label: "Shuffle", icon: Dice5 },
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
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <aside className="w-80 shrink-0 bg-[#ffffff] px-8 py-6 font-jbmono text-[#1f271a]">
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

      <nav className="mt-10 flex flex-col gap-5">
        {SIDEBAR_ITEMS.map(({ label, icon: Icon }, index) => {
          const isLast = index === SIDEBAR_ITEMS.length - 1;
          const isFilter = label === "Filter";

          if (isFilter) {
            return (
              <div key={label} className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((open) => !open)}
                  className="flex items-center gap-2 whitespace-nowrap text-left"
                >
                  <span aria-hidden className="select-none text-2m leading-none">
                    ├──
                  </span>
                  <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                  <span className="text-2m flex gap-6">{label}</span>
                  <span aria-hidden className="text-xl leading-none">
                    {isFilterOpen ? "˅" : "↗"}
                  </span>
                </button>

                {isFilterOpen && (
                  <div className="ml-1 flex flex-col gap-5 border-l border-[#1f271a]/15 py-1 pl-4 text-sm normal-case tracking-normal">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                        Price
                      </h3>
                      <div className="mt-2 flex items-center gap-2">
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
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                        Category
                      </h3>
                      <div className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
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
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#1f271a]/60">
                        Community
                      </h3>
                      <div className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                        {(Object.entries(BUCKET_LABELS) as [BucketSlug, string][]).map(
                          ([slug, bucketLabel]) => (
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
                          )
                        )}
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
              </div>
            );
          }

          return (
            <div key={label} className="flex items-center gap-2 whitespace-nowrap">
              <span aria-hidden className="select-none text-2m leading-none">
                {isLast ? "└──" : "├──"}
              </span>
              <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              <span className="text-2m flex gap-6">{label}</span>
              {!isLast && (
                <span aria-hidden className="text-xl leading-none">
                  ↗
                </span>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
