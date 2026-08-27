// Deterministic pastel colour per category/bucket tag, so the pills on
// EventsListView read as distinct at a glance instead of every tag sharing
// the same neutral tint. Categories and buckets are indexed into one shared
// palette, buckets offset past the category count, so the two vocabularies
// don't collide as long as they together stay within PASTEL_PALETTE's
// length (24 today: 10 categories + 14 buckets) — degrades gracefully by
// cycling via modulo if either vocabulary grows past that.

import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BUCKET_LABELS, type BucketSlug } from "@/lib/buckets";

const PASTEL_PALETTE = [
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  "bg-neutral-100 text-neutral-700 dark:bg-neutral-900/30 dark:text-neutral-300",
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
  "bg-[#fde2e4] text-[#9d174d] dark:bg-[#9d174d]/30 dark:text-[#fbcfe8]",
  "bg-[#e2ece9] text-[#0f5132] dark:bg-[#0f5132]/30 dark:text-[#a7f3d0]",
] as const;

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];
const BUCKET_ORDER = Object.keys(BUCKET_LABELS) as BucketSlug[];

const FALLBACK_PILL_CLASS =
  "bg-[#1f271a]/[0.06] text-[#1f271a]/80 dark:bg-white/10 dark:text-zinc-300";

export function categoryPillClass(category: string | null | undefined): string {
  if (!category) return FALLBACK_PILL_CLASS;
  const idx = CATEGORY_ORDER.indexOf(category as Category);
  if (idx === -1) return FALLBACK_PILL_CLASS;
  return PASTEL_PALETTE[idx % PASTEL_PALETTE.length];
}

export function bucketPillClass(slug: string | null | undefined): string {
  if (!slug) return FALLBACK_PILL_CLASS;
  const idx = BUCKET_ORDER.indexOf(slug as BucketSlug);
  if (idx === -1) return FALLBACK_PILL_CLASS;
  return PASTEL_PALETTE[(CATEGORY_ORDER.length + idx) % PASTEL_PALETTE.length];
}
