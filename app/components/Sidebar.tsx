"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ComponentType, SVGProps } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  FilterIcon,
  ConnectionsIcon,
  FavouritesIcon,
  NotificationsIcon,
  SettingsIcon,
  ShuffleIcon,
  GappedArrowIcon,
  PriceIcon,
  CategoryIcon,
  CommunityIcon,
} from "@/app/components/icons";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BUCKET_LABELS, NON_QUALIFYING_BUCKETS, type BucketSlug } from "@/lib/buckets";
import type { DateFilter } from "@/lib/date-filter";

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

type FilterSection = "price" | "category" | "community";

interface FilterSectionButtonProps {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isLast: boolean;
  isOpen: boolean;
  badge: string | null;
  onClick: () => void;
}

// Shared header row for each collapsible Filter section — styled exactly
// like the main-menu options (same tree connector, icon, text-base label)
// plus a chevron and an optional selection-count badge shown only while
// the section itself is collapsed.
function FilterSectionButton({
  label,
  icon: Icon,
  isLast,
  isOpen,
  badge,
  onClick,
}: FilterSectionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-2 whitespace-nowrap text-left text-[#1f271a]/55 transition-colors duration-200 hover:text-[#1f271a]"
    >
      <span aria-hidden className="select-none text-base leading-none">
        {isLast ? "└──" : "├──"}
      </span>
      <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      <span className="text-base flex gap-6">{label}</span>
      {badge && (
        <span className="rounded-full bg-[#1f271a]/10 px-2 py-0.5 text-xs leading-none normal-case tracking-normal text-[#1f271a]">
          {badge}
        </span>
      )}
      <span
        aria-hidden
        className={`ml-auto text-base leading-none transition-transform duration-300 ${
          isOpen ? "rotate-180" : ""
        }`}
      >
        ⌄
      </span>
    </button>
  );
}

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
  // Drives which detail content is rendered — deliberately NOT cleared when
  // the user presses Back. activeItem going null still slides the detail
  // panel back out of view, but its last content stays mounted throughout
  // that slide instead of vanishing instantly, so it reads as the panel
  // sliding away rather than the options disappearing.
  const [displayedItem, setDisplayedItem] = useState<string | null>(null);
  const [openFilterSection, setOpenFilterSection] = useState<FilterSection | null>(null);

  // ── Auth state ──
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      const supabase = createBrowserClient();
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setUser(session?.user ?? null);
        if (session?.user) setActiveItem(null);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // NEXT_PUBLIC_SUPABASE_* not set — auth box renders in guest state silently
    }
    return () => unsubscribe?.();
  }, []);

  async function handleGoogleSignIn() {
    setAuthError(null);
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    } catch {
      setAuthError("Google sign-in is not configured yet.");
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const supabase = createBrowserClient();
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) setAuthError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) setAuthError(error.message);
        else setAuthError("Check your email to confirm your account.");
      }
    } catch {
      setAuthError("Authentication is not available.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      setActiveItem(null);
    } catch {
      // ignore
    }
  }

  function openItem(label: string) {
    setActiveItem(label);
    setDisplayedItem(label);
  }

  const priceBadge =
    openFilterSection !== "price" && filters.maxPrice !== null
      ? `≤£${filters.maxPrice}`
      : null;
  const categoryBadge =
    openFilterSection !== "category" && filters.categories.length > 0
      ? String(filters.categories.length)
      : null;
  const communityBadge =
    openFilterSection !== "community" && filters.buckets.length > 0
      ? String(filters.buckets.length)
      : null;

  function toggleFilterSection(section: FilterSection) {
    setOpenFilterSection((current) => (current === section ? null : section));
  }

  const avatarLetter =
    user?.user_metadata?.full_name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    null;

  return (
    <aside className="w-80 shrink-0 overflow-hidden bg-[#ffffff] px-8 py-6 font-jbmono text-[#1f271a]">

      {/* ── Auth box ── */}
      <button
        type="button"
        onClick={() => openItem("Account")}
        className="mb-6 flex w-full items-center gap-3 rounded-xl border border-[#1f271a]/10 px-3 py-2.5 text-left transition-colors duration-200 hover:border-[#1f271a]/25 hover:bg-[#1f271a]/[0.02]"
      >
        {user ? (
          <>
            {user.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f271a] text-sm font-semibold text-white">
                {avatarLetter ?? "?"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#1f271a]">
                {user.user_metadata?.full_name ?? "Account"}
              </p>
              <p className="truncate text-xs text-[#1f271a]/50">{user.email}</p>
            </div>
            <span aria-hidden className="shrink-0 text-lg leading-none text-[#1f271a]/25">⋮</span>
          </>
        ) : (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#1f271a]/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-[#1f271a]/40" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1f271a]">Not signed in</p>
              <p className="text-xs text-[#1f271a]/50">Sign in to save events</p>
            </div>
            <span aria-hidden className="shrink-0 text-sm text-[#1f271a]/30">→</span>
          </>
        )}
      </button>

      {/* Date filters + nav slide together so opening any panel sweeps them away */}
      <div className="relative mt-4 overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: activeItem ? "translateX(-100%)" : "translateX(0%)" }}
        >
          {/* Left column: date filters then primary nav */}
          <div className="flex w-full shrink-0 flex-col pr-1">
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

          <nav className="mt-10 flex w-full shrink-0 flex-col gap-5">
            {SIDEBAR_ITEMS.map(({ label, icon: Icon }, index) => {
              const isLast = index === SIDEBAR_ITEMS.length - 1;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => openItem(label)}
                  className="group flex cursor-pointer items-center gap-2 whitespace-nowrap text-left text-[#1f271a]/55 transition-colors duration-200 hover:text-[#1f271a]"
                >
                  <span aria-hidden className="select-none text-base leading-none">
                    {isLast ? "└──" : "├──"}
                  </span>
                  <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                  <span className="text-base flex gap-6">{label}</span>
                  {!isLast && <GappedArrowIcon aria-hidden className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </nav>
          </div>{/* end left column */}

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
              {displayedItem === "Filter" && (
                <div className="flex flex-col gap-4 text-sm normal-case tracking-normal">
                  <div>
                    <FilterSectionButton
                      label="Price"
                      icon={PriceIcon}
                      isLast={false}
                      isOpen={openFilterSection === "price"}
                      badge={priceBadge}
                      onClick={() => toggleFilterSection("price")}
                    />
                    {openFilterSection === "price" && (
                      <div className="mt-3 flex items-center gap-2 pl-9">
                        <input
                          type="range"
                          aria-label="Maximum price"
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
                    )}
                  </div>

                  <div>
                    <FilterSectionButton
                      label="Category"
                      icon={CategoryIcon}
                      isLast={false}
                      isOpen={openFilterSection === "category"}
                      badge={categoryBadge}
                      onClick={() => toggleFilterSection("category")}
                    />
                    {openFilterSection === "category" && (
                      <div className="mt-3 flex flex-col gap-1.5 pl-9">
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
                    )}
                  </div>

                  <div>
                    <FilterSectionButton
                      label="Community"
                      icon={CommunityIcon}
                      isLast={true}
                      isOpen={openFilterSection === "community"}
                      badge={communityBadge}
                      onClick={() => toggleFilterSection("community")}
                    />
                    {openFilterSection === "community" && (
                      <div className="mt-3 flex flex-col gap-1.5 pl-9">
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
                    )}
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

              {displayedItem === "Account" && (
                <div className="flex flex-col gap-4 normal-case tracking-normal">
                  {user ? (
                    /* ── Signed-in view ── */
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        {user.user_metadata?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.user_metadata.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f271a] text-sm font-semibold text-white">
                            {avatarLetter ?? "?"}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#1f271a]">
                            {user.user_metadata?.full_name ?? "Account"}
                          </p>
                          <p className="truncate text-xs text-[#1f271a]/50">{user.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="self-start text-sm text-[#1f271a]/60 underline underline-offset-4 hover:text-[#1f271a]"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    /* ── Sign-in / sign-up view ── */
                    <div className="flex flex-col gap-4">
                      {/* Google */}
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="flex items-center justify-center gap-2.5 rounded-lg border border-[#1f271a]/20 px-4 py-2.5 text-sm font-medium text-[#1f271a] transition-colors hover:bg-[#1f271a]/5"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Sign in with Google
                      </button>

                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-[#1f271a]/10" />
                        <span className="text-xs text-[#1f271a]/40">or</span>
                        <div className="h-px flex-1 bg-[#1f271a]/10" />
                      </div>

                      {/* Email / password */}
                      <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="Email"
                          required
                          className="rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                        />
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Password"
                          required
                          className="rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                        />

                        {authError && (
                          <p className="text-xs text-red-600">{authError}</p>
                        )}

                        <button
                          type="submit"
                          disabled={authLoading}
                          className="rounded-lg bg-[#1f271a] py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {authLoading ? "…" : authMode === "signin" ? "Sign in" : "Create account"}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode(authMode === "signin" ? "signup" : "signin");
                          setAuthError(null);
                        }}
                        className="text-center text-xs text-[#1f271a]/50 hover:text-[#1f271a]"
                      >
                        {authMode === "signin"
                          ? "New here? Create an account"
                          : "Already have an account? Sign in"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {displayedItem && displayedItem !== "Filter" && displayedItem !== "Account" && (
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
