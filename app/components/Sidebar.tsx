"use client";

import {
  ListFilter,
  Users,
  Heart,
  Bell,
  Settings as SettingsIcon,
  Dice5,
  type LucideIcon,
} from "lucide-react";

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

interface SidebarProps {
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
}

export default function Sidebar({ dateFilter, onDateFilterChange }: SidebarProps) {
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
