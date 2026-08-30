"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ComponentType, SVGProps } from "react";
import { track } from "@vercel/analytics";
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
  AccessibilityIcon,
  CalendarIcon,
  LocationPinIcon,
  LockIcon,
  MailIcon,
  TrashIcon,
} from "@/app/components/icons";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BUCKET_LABELS, NON_QUALIFYING_BUCKETS, ACCESS_ONLY_BUCKETS, type BucketSlug } from "@/lib/buckets";
import type { DateFilter } from "@/lib/date-filter";
import type { EventListItem } from "@/lib/types";
import { formatEventDate, formatEventPrice } from "@/lib/format";
import { lookupPostcode } from "@/lib/geocode";
import {
  fetchFavouritedEvents,
  fetchFavouritedVenues,
  setEventFavourited,
  setVenueFavourited,
  fetchBucketSlugToId,
  fetchNotificationBucketIds,
  setNotificationBucket,
  fetchProfileLocation,
  updateProfileLocation,
  type FavouriteVenue,
} from "@/lib/favourites";
import { fetchIsTrustedModerator } from "@/lib/moderation";

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
  nearMeOnly: boolean; // requires homeLocation to have any effect — see matchesFilters in AppShell.tsx
}

export const DEFAULT_FILTERS: FilterState = {
  maxPrice: null,
  categories: [],
  buckets: [],
  nearMeOnly: false,
};

// The resolved (lat/lng/radius) triple AppShell filters events against —
// owned by AppShell (fetched on login, same as favourites) so the Filter
// panel's "near me" toggle works immediately without requiring a visit to
// Settings first. Settings still owns editing it; it reports changes back
// up via onHomeLocationChange so both copies stay in sync.
export interface HomeLocation {
  lat: number;
  lng: number;
  radiusKm: number;
}

const MAX_PRICE_CAP = 100;

const byLabel = ([, a]: [BucketSlug, string], [, b]: [BucketSlug, string]) => a.localeCompare(b);

// Sorted alphabetically by label per user request, not declaration order
// (lib/categories.ts's declaration order matters elsewhere — it's
// inferCategory's first-match-wins priority list — so the sort happens
// here, at the filter-UI call site, rather than reordering that file).
const SORTED_CATEGORY_ENTRIES = (Object.entries(CATEGORY_LABELS) as [Category, string][]).sort(
  ([, a], [, b]) => a.localeCompare(b)
);

// Cost is already covered by the price slider — these describe access/cost,
// not community, so they're left out of the Community checkbox list.
// Accessibility buckets (disability/autistic/deaf) get their own separate
// filter section below (ACCESSIBILITY_BUCKET_ENTRIES) rather than being
// mixed in here — they describe a venue/event feature, not a community, per
// lib/buckets.ts's ACCESS_ONLY_BUCKETS. Both lists are sorted alphabetically
// by label, same reasoning as SORTED_CATEGORY_ENTRIES above.
const COMMUNITY_BUCKET_ENTRIES = (Object.entries(BUCKET_LABELS) as [BucketSlug, string][])
  .filter(([slug]) => !NON_QUALIFYING_BUCKETS.includes(slug) && !ACCESS_ONLY_BUCKETS.includes(slug))
  .sort(byLabel);

const ACCESSIBILITY_BUCKET_ENTRIES = (Object.entries(BUCKET_LABELS) as [BucketSlug, string][])
  .filter(([slug]) => ACCESS_ONLY_BUCKETS.includes(slug))
  .sort(byLabel);

// Notification flags cover cost too ("free events" is an explicit ask) —
// unlike the Community filter list, nothing is excluded here.
const ALL_BUCKET_ENTRIES = Object.entries(BUCKET_LABELS) as [BucketSlug, string][];

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;

type FilterSection = "price" | "category" | "community" | "accessibility" | "location";
type SettingsSection = "location" | "notify";

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

interface SectionHeadingProps {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isLast?: boolean;
  onClick?: () => void;
}

// Group header for Favourites/Settings/Account — same tree connector + icon
// + text-base label as FilterSectionButton above. Static (a <div>) for
// group headers that don't collapse (Events, Venues, Notify me about, Home
// location); becomes a clickable row (a <button>) when onClick is passed,
// e.g. Account's "Notification settings" jumping to the Settings panel.
function SectionHeading({ label, icon: Icon, isLast = false, onClick }: SectionHeadingProps) {
  const content = (
    <>
      <span aria-hidden className="select-none text-base leading-none">
        {isLast ? "└──" : "├──"}
      </span>
      <Icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      <span className="text-base flex gap-6">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full cursor-pointer items-center gap-2 whitespace-nowrap text-left text-[#1f271a]/55 transition-colors duration-200 hover:text-[#1f271a]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-[#1f271a]/55">{content}</div>
  );
}

interface SidebarProps {
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  homeLocation: HomeLocation | null;
  onHomeLocationChange: (location: HomeLocation | null) => void;
  // Below `md`, the sidebar is a slide-in drawer toggled from Header's
  // top-left button rather than always-visible — isOpen/onClose only
  // matter on that breakpoint; at `md` and up the sidebar ignores them and
  // is always shown inline, same as before this existed.
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  dateFilter,
  onDateFilterChange,
  filters,
  onFiltersChange,
  homeLocation,
  onHomeLocationChange,
  isOpen,
  onClose,
}: SidebarProps) {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  // Drives which detail content is rendered — deliberately NOT cleared when
  // the user presses Back. activeItem going null still slides the detail
  // panel back out of view, but its last content stays mounted throughout
  // that slide instead of vanishing instantly, so it reads as the panel
  // sliding away rather than the options disappearing.
  const [displayedItem, setDisplayedItem] = useState<string | null>(null);
  const [openFilterSection, setOpenFilterSection] = useState<FilterSection | null>(null);
  const [openSettingsSection, setOpenSettingsSection] = useState<SettingsSection | null>(null);

  // ── Auth state ──
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ── Account management (Account panel, signed-in view) ──
  // Change password/email are real Supabase Auth calls on the active
  // session (supabase.auth.updateUser), same direct-client pattern used
  // everywhere else. Delete account has no backend support yet — no
  // service-role route exists to actually remove an auth.users row — so
  // it's an honest mock: the confirm step never claims success.
  const [accountSection, setAccountSection] = useState<"password" | "email" | "delete" | null>(
    null
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [hasClaimedOrganiser, setHasClaimedOrganiser] = useState(false);
  const [isTrustedModerator, setIsTrustedModerator] = useState(false);

  // ── Favourites state ──
  const [favouriteEvents, setFavouriteEvents] = useState<EventListItem[]>([]);
  const [favouriteVenues, setFavouriteVenues] = useState<FavouriteVenue[]>([]);
  const [favouritesLoaded, setFavouritesLoaded] = useState(false);

  // ── Settings state (notification flags + home location/radius) ──
  const [bucketSlugToId, setBucketSlugToId] = useState<Map<BucketSlug, string>>(new Map());
  const [notificationBucketIds, setNotificationBucketIdsState] = useState<Set<string>>(new Set());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [homeLabel, setHomeLabel] = useState<string | null>(null);
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [postcodeInput, setPostcodeInput] = useState("");
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

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

  // Only show "Manage your listing" once there's actually something to
  // manage — avoids a dead-ended nav item for the vast majority of visitors
  // who haven't claimed an organiser.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasClaimedOrganiser(false);
      return;
    }
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase
          .from("organisers")
          .select("id")
          .eq("claimed_by", user.id)
          .limit(1)
          .maybeSingle();
        setHasClaimedOrganiser(!!data);
      } catch {
        setHasClaimedOrganiser(false);
      }
    })();
  }, [user]);

  // Same "only show it if it applies" reasoning as "Manage your listing"
  // above — most signed-in users are never granted moderator trust
  // (docs/PROJECT_PLAN.md §13, Tier 1), so the link stays hidden for them.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTrustedModerator(false);
      return;
    }
    fetchIsTrustedModerator(user.id)
      .then(setIsTrustedModerator)
      .catch(() => setIsTrustedModerator(false));
  }, [user]);

  // Favourites are fetched lazily, the first time the panel is opened —
  // avoids the round-trip for the vast majority of page loads where a
  // signed-in user never opens it.
  useEffect(() => {
    if (!user || displayedItem !== "Favourites" || favouritesLoaded) return;
    (async () => {
      const [events, venues] = await Promise.all([
        fetchFavouritedEvents(user.id),
        fetchFavouritedVenues(user.id),
      ]);
      setFavouriteEvents(events);
      setFavouriteVenues(venues);
      setFavouritesLoaded(true);
    })();
  }, [user, displayedItem, favouritesLoaded]);

  // Clear stale favourites once signed out, so a later sign-in as a
  // different account can't briefly show the previous user's list.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavouriteEvents([]);
      setFavouriteVenues([]);
      setFavouritesLoaded(false);
    }
  }, [user]);

  // Same lazy-load-once-opened pattern for Settings: bucket vocabulary,
  // this user's notification flags, and their saved home location/radius.
  useEffect(() => {
    if (!user || displayedItem !== "Settings" || settingsLoaded) return;
    (async () => {
      const [slugMap, bucketIds, location] = await Promise.all([
        fetchBucketSlugToId(),
        fetchNotificationBucketIds(user.id),
        fetchProfileLocation(user.id),
      ]);
      setBucketSlugToId(slugMap);
      setNotificationBucketIdsState(bucketIds);
      const resolvedRadiusKm = location?.travel_radius_km ?? DEFAULT_RADIUS_KM;
      if (location?.home_lat != null && location?.home_lng != null) {
        setHomeCoords({ lat: location.home_lat, lng: location.home_lng });
      }
      setHomeLabel(location?.home_label ?? null);
      setRadiusKm(resolvedRadiusKm);
      setSettingsLoaded(true);
      // AppShell already fetched this on login for the Filter panel's "near
      // me" toggle — re-report it here too in case that fetch hasn't landed
      // yet, so Settings and the Filter panel never disagree.
      onHomeLocationChange(
        location?.home_lat != null && location?.home_lng != null
          ? { lat: location.home_lat, lng: location.home_lng, radiusKm: resolvedRadiusKm }
          : null
      );
    })();
  }, [user, displayedItem, settingsLoaded, onHomeLocationChange]);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotificationBucketIdsState(new Set());
      setSettingsLoaded(false);
      setHomeLabel(null);
      setHomeCoords(null);
      setRadiusKm(DEFAULT_RADIUS_KM);
      onHomeLocationChange(null);
    }
  }, [user, onHomeLocationChange]);

  async function toggleEventFavourite(event: EventListItem) {
    if (!user) return;
    setFavouriteEvents((current) => current.filter((e) => e.id !== event.id));
    await setEventFavourited(user.id, event.id, false);
  }

  async function toggleVenueFavourite(venue: FavouriteVenue) {
    if (!user) return;
    setFavouriteVenues((current) => current.filter((v) => v.id !== venue.id));
    await setVenueFavourited(user.id, venue.id, false);
  }

  async function toggleNotificationBucket(slug: BucketSlug) {
    if (!user) return;
    const bucketId = bucketSlugToId.get(slug);
    if (!bucketId) return;
    const enabled = notificationBucketIds.has(bucketId);
    setNotificationBucketIdsState((current) => {
      const next = new Set(current);
      if (enabled) next.delete(bucketId);
      else next.add(bucketId);
      return next;
    });
    await setNotificationBucket(user.id, bucketId, !enabled);
  }

  async function handleUseMyLocation() {
    if (!user || !navigator.geolocation) {
      setLocationStatus("Location isn't available in this browser.");
      return;
    }
    setLocationBusy(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setHomeCoords(coords);
        setHomeLabel("Current location");
        await updateProfileLocation(user.id, {
          home_lat: coords.lat,
          home_lng: coords.lng,
          home_label: "Current location",
          travel_radius_km: radiusKm,
        });
        onHomeLocationChange({ lat: coords.lat, lng: coords.lng, radiusKm });
        setLocationBusy(false);
        setLocationStatus("Saved.");
      },
      () => {
        setLocationBusy(false);
        setLocationStatus("Couldn't get your location — check browser permissions.");
      }
    );
  }

  async function handlePostcodeLookup() {
    if (!user || !postcodeInput.trim()) return;
    setLocationBusy(true);
    setLocationStatus(null);
    const result = await lookupPostcode(postcodeInput);
    if (!result) {
      setLocationBusy(false);
      setLocationStatus("Postcode not found.");
      return;
    }
    setHomeCoords({ lat: result.lat, lng: result.lng });
    setHomeLabel(result.label);
    await updateProfileLocation(user.id, {
      home_lat: result.lat,
      home_lng: result.lng,
      home_label: result.label,
      travel_radius_km: radiusKm,
    });
    onHomeLocationChange({ lat: result.lat, lng: result.lng, radiusKm });
    setLocationBusy(false);
    setLocationStatus("Saved.");
  }

  async function handleRadiusChange(value: number) {
    setRadiusKm(value);
    if (!user || !homeCoords) return;
    await updateProfileLocation(user.id, { travel_radius_km: value });
    onHomeLocationChange({ lat: homeCoords.lat, lng: homeCoords.lng, radiusKm: value });
  }

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

  function toggleAccountSection(section: "password" | "email" | "delete") {
    setAccountSection((current) => (current === section ? null : section));
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordStatus("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords don't match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordStatus(null);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setPasswordStatus(error.message);
      else {
        setPasswordStatus("Password updated.");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordStatus("Couldn't update password right now.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailBusy(true);
    setEmailStatus(null);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) setEmailStatus(error.message);
      else setEmailStatus("Check both your old and new inbox to confirm the change.");
    } catch {
      setEmailStatus("Couldn't update email right now.");
    } finally {
      setEmailBusy(false);
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
  const selectedCommunityCount = filters.buckets.filter(
    (b) => !ACCESS_ONLY_BUCKETS.includes(b as BucketSlug)
  ).length;
  const selectedAccessibilityCount = filters.buckets.filter((b) =>
    ACCESS_ONLY_BUCKETS.includes(b as BucketSlug)
  ).length;
  const communityBadge =
    openFilterSection !== "community" && selectedCommunityCount > 0
      ? String(selectedCommunityCount)
      : null;
  const accessibilityBadge =
    openFilterSection !== "accessibility" && selectedAccessibilityCount > 0
      ? String(selectedAccessibilityCount)
      : null;
  const locationBadge =
    openFilterSection !== "location" && filters.nearMeOnly ? "On" : null;

  function toggleFilterSection(section: FilterSection) {
    setOpenFilterSection((current) => (current === section ? null : section));
  }

  function toggleSettingsSection(section: SettingsSection) {
    setOpenSettingsSection((current) => (current === section ? null : section));
  }

  const avatarLetter =
    user?.user_metadata?.full_name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    null;

  return (
    <>
      {/* Backdrop — mobile drawer only; desktop (md+) never renders this
          since the sidebar there is always inline, never a drawer. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] shrink-0 overflow-y-auto overflow-x-hidden bg-[#ffffff] px-8 py-6 font-jbmono text-[#1f271a] transition-transform duration-300 ease-in-out md:sticky md:top-14 md:z-auto md:h-[calc(100vh-3.5rem)] md:max-w-none md:translate-x-0 md:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[#1f271a]/50 transition-colors duration-200 hover:bg-[#1f271a]/5 hover:text-[#1f271a] md:hidden"
        >
          <span aria-hidden className="text-xl leading-none">×</span>
        </button>

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

          <div className="mt-8 flex flex-col gap-2 text-xs text-[#1f271a]/40">
            <a href="/events" className="transition-colors duration-200 hover:text-[#1f271a]">
              Browse by city
            </a>
            <a href="/submit" className="transition-colors duration-200 hover:text-[#1f271a]">
              Submit an event
            </a>
            <a href="/claim" className="transition-colors duration-200 hover:text-[#1f271a]">
              Claim your listing
            </a>
            {hasClaimedOrganiser && (
              <a href="/organiser/manage" className="transition-colors duration-200 hover:text-[#1f271a]">
                Manage your listing
              </a>
            )}
            {isTrustedModerator && (
              <a href="/moderate" className="transition-colors duration-200 hover:text-[#1f271a]">
                Community moderation
              </a>
            )}
          </div>
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
                        {SORTED_CATEGORY_ENTRIES.map(([slug, catLabel]) => (
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
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <FilterSectionButton
                      label="Community"
                      icon={CommunityIcon}
                      isLast={false}
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
                                const enabling = !filters.buckets.includes(slug);
                                const next = enabling
                                  ? [...filters.buckets, slug]
                                  : filters.buckets.filter((b) => b !== slug);
                                onFiltersChange({ ...filters, buckets: next });
                                // Page-view analytics (Analytics component in
                                // app/layout.tsx) already covers "which
                                // areas get engagement" via per-city/region
                                // URLs — bucket filtering has no URL of its
                                // own, so it needs an explicit custom event
                                // to answer the other half of docs/PROJECT_PLAN.md
                                // Phase 6's "which buckets ... get engagement" goal.
                                track("bucket_filter", { bucket: slug, enabled: enabling });
                              }}
                            />
                            {bucketLabel}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <FilterSectionButton
                      label="Accessibility"
                      icon={AccessibilityIcon}
                      isLast={false}
                      isOpen={openFilterSection === "accessibility"}
                      badge={accessibilityBadge}
                      onClick={() => toggleFilterSection("accessibility")}
                    />
                    {openFilterSection === "accessibility" && (
                      <div className="mt-3 flex flex-col gap-1.5 pl-9">
                        {ACCESSIBILITY_BUCKET_ENTRIES.map(([slug, bucketLabel]) => (
                          <label key={slug} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={filters.buckets.includes(slug)}
                              onChange={() => {
                                const enabling = !filters.buckets.includes(slug);
                                const next = enabling
                                  ? [...filters.buckets, slug]
                                  : filters.buckets.filter((b) => b !== slug);
                                onFiltersChange({ ...filters, buckets: next });
                                track("bucket_filter", { bucket: slug, enabled: enabling });
                              }}
                            />
                            {bucketLabel}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <FilterSectionButton
                      label="Location"
                      icon={LocationPinIcon}
                      isLast={true}
                      isOpen={openFilterSection === "location"}
                      badge={locationBadge}
                      onClick={() => toggleFilterSection("location")}
                    />
                    {openFilterSection === "location" && (
                      <div className="mt-3 flex flex-col gap-2 pl-9">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters.nearMeOnly}
                            disabled={!homeLocation}
                            onChange={() =>
                              onFiltersChange({ ...filters, nearMeOnly: !filters.nearMeOnly })
                            }
                          />
                          {homeLocation
                            ? `Only within ${homeLocation.radiusKm} km of home`
                            : "Only within my travel radius"}
                        </label>
                        {!homeLocation && (
                          <p className="text-xs text-[#1f271a]/50">
                            Set your home location in Settings to use this filter.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {(filters.maxPrice !== null ||
                    filters.categories.length > 0 ||
                    filters.buckets.length > 0 ||
                    filters.nearMeOnly) && (
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
                    <div className="flex flex-col gap-5">
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

                      <div className="flex flex-col gap-3 text-sm normal-case tracking-normal">
                        <SectionHeading
                          label="Notification settings"
                          icon={NotificationsIcon}
                          onClick={() => openItem("Settings")}
                        />

                        <div>
                          <FilterSectionButton
                            label="Change password"
                            icon={LockIcon}
                            isLast={false}
                            isOpen={accountSection === "password"}
                            badge={null}
                            onClick={() => toggleAccountSection("password")}
                          />
                          {accountSection === "password" && (
                            <form
                              onSubmit={handleChangePassword}
                              className="mt-3 flex flex-col gap-2 pl-9"
                            >
                              <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="New password"
                                required
                                className="rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                              />
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                required
                                className="rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                              />
                              {passwordStatus && (
                                <p className="text-xs text-[#1f271a]/60">{passwordStatus}</p>
                              )}
                              <button
                                type="submit"
                                disabled={passwordBusy}
                                className="self-start rounded-lg bg-[#1f271a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {passwordBusy ? "…" : "Update password"}
                              </button>
                            </form>
                          )}
                        </div>

                        <div>
                          <FilterSectionButton
                            label="Change email"
                            icon={MailIcon}
                            isLast={false}
                            isOpen={accountSection === "email"}
                            badge={null}
                            onClick={() => toggleAccountSection("email")}
                          />
                          {accountSection === "email" && (
                            <form
                              onSubmit={handleChangeEmail}
                              className="mt-3 flex flex-col gap-2 pl-9"
                            >
                              <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="New email address"
                                required
                                className="rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                              />
                              {emailStatus && (
                                <p className="text-xs text-[#1f271a]/60">{emailStatus}</p>
                              )}
                              <button
                                type="submit"
                                disabled={emailBusy}
                                className="self-start rounded-lg bg-[#1f271a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {emailBusy ? "…" : "Update email"}
                              </button>
                            </form>
                          )}
                        </div>

                        <div>
                          <FilterSectionButton
                            label="Delete account"
                            icon={TrashIcon}
                            isLast={true}
                            isOpen={accountSection === "delete"}
                            badge={null}
                            onClick={() => toggleAccountSection("delete")}
                          />
                          {accountSection === "delete" && (
                            <div className="mt-3 flex flex-col gap-2 pl-9">
                              <p className="text-xs text-[#1f271a]/60">
                                Account deletion isn&apos;t available yet — this would
                                permanently remove your profile, favourites, and claims. Email
                                support to request it in the meantime.
                              </p>
                              {!deleteConfirming ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirming(true)}
                                  className="self-start rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  Delete my account
                                </button>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <p className="text-xs font-medium text-red-600">
                                    Not wired up yet — no action was taken.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirming(false)}
                                    className="self-start text-xs text-[#1f271a]/60 underline underline-offset-4"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
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

              {displayedItem === "Favourites" && (
                <div className="flex flex-col gap-5 normal-case tracking-normal">
                  {!user ? (
                    <p className="text-sm text-[#1f271a]/50">
                      Sign in to save events and venues.
                    </p>
                  ) : !favouritesLoaded ? (
                    <p className="text-sm text-[#1f271a]/50">Loading…</p>
                  ) : favouriteEvents.length === 0 && favouriteVenues.length === 0 ? (
                    <p className="text-sm text-[#1f271a]/50">
                      Nothing favourited yet — tap the heart on an event or venue.
                    </p>
                  ) : (
                    <>
                      {favouriteEvents.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <SectionHeading
                            label="Events"
                            icon={CalendarIcon}
                            isLast={favouriteVenues.length === 0}
                          />
                          {favouriteEvents.map((event) => {
                            const meta = [
                              formatEventDate(event.start_at),
                              event.venues?.name ?? null,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            const price = formatEventPrice(event);
                            return (
                              <div
                                key={event.id}
                                className="flex items-start gap-2 rounded-lg border border-[#1f271a]/10 px-3 py-2 text-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  {event.source_url ? (
                                    <a
                                      href={event.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate font-medium text-[#1f271a] hover:underline"
                                    >
                                      {event.title}
                                    </a>
                                  ) : (
                                    <p className="truncate font-medium text-[#1f271a]">{event.title}</p>
                                  )}
                                  <p className="truncate text-xs text-[#1f271a]/50">
                                    {meta}
                                    {price ? ` · ${price}` : ""}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Remove from favourites"
                                  onClick={() => toggleEventFavourite(event)}
                                  className="shrink-0 text-[#1f271a]/40 hover:text-[#1f271a]"
                                >
                                  <FavouritesIcon className="h-4 w-4" fill="currentColor" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {favouriteVenues.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <SectionHeading label="Venues" icon={LocationPinIcon} isLast />
                          {favouriteVenues.map((venue) => (
                            <div
                              key={venue.id}
                              className="flex items-start gap-2 rounded-lg border border-[#1f271a]/10 px-3 py-2 text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-[#1f271a]">{venue.name}</p>
                                {venue.city && (
                                  <p className="truncate text-xs text-[#1f271a]/50">{venue.city}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                aria-label="Remove from favourites"
                                onClick={() => toggleVenueFavourite(venue)}
                                className="shrink-0 text-[#1f271a]/40 hover:text-[#1f271a]"
                              >
                                <FavouritesIcon className="h-4 w-4" fill="currentColor" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {displayedItem === "Settings" && (
                <div className="flex flex-col gap-4 normal-case tracking-normal">
                  {!user ? (
                    <p className="text-sm text-[#1f271a]/50">
                      Sign in to set notification flags and a home location.
                    </p>
                  ) : (
                    <>
                      <div>
                        <FilterSectionButton
                          label="Home location"
                          icon={LocationPinIcon}
                          isLast={false}
                          isOpen={openSettingsSection === "location"}
                          badge={null}
                          onClick={() => toggleSettingsSection("location")}
                        />
                        {openSettingsSection === "location" && (
                          <div className="mt-3 flex flex-col gap-4 pl-9">
                            <div className="flex flex-col gap-2">
                              <p className="text-sm text-[#1f271a]/70">
                                {homeLabel ?? "Not set"}
                              </p>
                              <button
                                type="button"
                                onClick={handleUseMyLocation}
                                disabled={locationBusy}
                                className="self-start text-xs underline underline-offset-4 disabled:opacity-50"
                              >
                                Use my current location
                              </button>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={postcodeInput}
                                  onChange={(e) => setPostcodeInput(e.target.value)}
                                  placeholder="Postcode"
                                  className="min-w-0 flex-1 rounded-lg border border-[#1f271a]/15 bg-transparent px-3 py-2 text-sm placeholder:text-[#1f271a]/30 focus:outline-none focus:ring-1 focus:ring-[#1f271a]/30"
                                />
                                <button
                                  type="button"
                                  onClick={handlePostcodeLookup}
                                  disabled={locationBusy || !postcodeInput.trim()}
                                  className="shrink-0 rounded-lg border border-[#1f271a]/20 px-3 py-2 text-xs font-medium disabled:opacity-50"
                                >
                                  Set
                                </button>
                              </div>
                              {locationStatus && (
                                <p className="text-xs text-[#1f271a]/50">{locationStatus}</p>
                              )}
                            </div>

                            <div className="flex flex-col gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#1f271a]/40">
                                Travel radius
                              </p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  aria-label="Travel radius"
                                  min={1}
                                  max={MAX_RADIUS_KM}
                                  step={1}
                                  value={radiusKm}
                                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                                  className="w-full"
                                />
                                <span className="whitespace-nowrap text-xs">{radiusKm} km</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <FilterSectionButton
                          label="Notify me about"
                          icon={NotificationsIcon}
                          isLast={true}
                          isOpen={openSettingsSection === "notify"}
                          badge={null}
                          onClick={() => toggleSettingsSection("notify")}
                        />
                        {openSettingsSection === "notify" && (
                          <div className="mt-3 flex flex-col gap-1.5 pl-9">
                            {ALL_BUCKET_ENTRIES.map(([slug, bucketLabel]) => {
                              const bucketId = bucketSlugToId.get(slug);
                              const checked = !!bucketId && notificationBucketIds.has(bucketId);
                              return (
                                <label key={slug} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!bucketId}
                                    onChange={() => toggleNotificationBucket(slug)}
                                  />
                                  {bucketLabel}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {displayedItem &&
                displayedItem !== "Filter" &&
                displayedItem !== "Account" &&
                displayedItem !== "Favourites" &&
                displayedItem !== "Settings" && (
                  <p className="text-sm normal-case tracking-normal text-[#1f271a]/60">
                    Coming soon.
                  </p>
                )}
            </div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
