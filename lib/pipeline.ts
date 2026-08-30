import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEventBuckets, AUTO_APPROVE_THRESHOLD } from "@/lib/buckets";
import { venueAccessibilityMatches } from "@/lib/venue-accessibility";
import { inferCategory } from "@/lib/categories";
import { scoreEventQuality } from "@/lib/quality";

type AdminClient = ReturnType<typeof createAdminClient>;

// PostgREST caps a single select at 1000 rows — with 1600+ published events
// already, an unpaginated query silently drops whichever rows happen to
// fall past that cutoff (in practice, the most recently ingested ones),
// leaving them forever unclassified/unscored. Shared by both functions
// below that need to see every published event, not just the first 1000.
const PAGE_SIZE = 1000;

export interface ExpiryResult {
  expired: number;
}

// Moves events whose run has ended out of the live/published set — see
// supabase/migrations/0007_expiry.sql. Run before dedup/classify/quality so
// they don't keep reprocessing rows that will never be shown again.
export async function runExpiry(admin: AdminClient): Promise<ExpiryResult> {
  const { data, error } = await admin.rpc("expire_ended_events");
  if (error) throw new Error(`Expiry pass failed: ${error.message}`);
  return { expired: data ?? 0 };
}

export interface DedupResult {
  venuesMerged: number | null;
  eventsMatched: number | null;
}

export async function runDedup(admin: AdminClient): Promise<DedupResult> {
  // Venues first: merging split venue rows (e.g. "11 Water Street" vs
  // "11 Water St") makes event dedup more effective too, since it only
  // matches events sharing the same venue_id.
  const { data: venuesMerged, error: venueError } = await admin.rpc(
    "merge_duplicate_venues"
  );
  if (venueError) throw new Error(`Venue merge failed: ${venueError.message}`);

  const { data: eventsMatched, error: eventError } = await admin.rpc(
    "run_event_dedup"
  );
  if (eventError) throw new Error(`Event dedup pass failed: ${eventError.message}`);

  return { venuesMerged, eventsMatched };
}

export interface ClassificationResult {
  eventsProcessed: number;
  eventsTagged: number;
  bucketAssignments: number;
  errors: string[];
}

export async function runClassification(admin: AdminClient): Promise<ClassificationResult> {
  const { data: buckets, error: bucketsError } = await admin
    .from("buckets")
    .select("id, slug");
  if (bucketsError) throw new Error(bucketsError.message);
  const bucketIdBySlug = new Map<string, string>(
    (buckets ?? []).map((b) => [b.slug as string, b.id as string])
  );

  interface EventForClassification {
    id: string;
    title: string;
    description: string | null;
    is_free: boolean;
    venues: { name: string } | null;
  }

  const events: EventForClassification[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select("id, title, description, is_free, venues(name)")
      .eq("status", "published")
      .eq("is_duplicate", false)
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<EventForClassification[]>();
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  // (event_id, bucket_id) pairs a moderator has already approved or
  // rejected at /admin/review are permanent decisions — re-classifying on
  // every ingest must never overwrite them, or every review gets silently
  // undone the next time the source is re-scraped. Scanning all
  // moderator/rejected rows up front (rather than filtering per-event) is
  // cheap since reviewed pairs are always a small fraction of all events.
  const lockedPairs = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("event_buckets")
      .select("event_id, bucket_id")
      .in("assigned_by", ["moderator", "rejected"])
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      lockedPairs.add(`${row.event_id}:${row.bucket_id}`);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  let eventsTagged = 0;
  let bucketAssignments = 0;
  const errors: string[] = [];

  for (const event of events) {
    const keywordMatches = classifyEventBuckets({
      title: event.title,
      description: event.description,
      isFree: event.is_free,
    });
    const accessMatches = venueAccessibilityMatches(event.venues?.name);
    if (keywordMatches.length === 0 && accessMatches.length === 0) continue;

    // Keyword and venue-accessibility can both match the same bucket (e.g.
    // an event's own copy says "wheelchair accessible" for a venue this
    // module also knows is step-free) — a single upsert can't touch the
    // same (event_id, bucket_id) conflict key twice, so keep only the
    // higher-confidence match per bucket, preferring keyword on a tie
    // since its evidence is specific to this event.
    const bestByBucket = new Map<string, { match: (typeof keywordMatches)[number]; assignedBy: "keyword" | "venue-accessibility" }>();
    for (const match of keywordMatches) {
      bestByBucket.set(match.bucketSlug, { match, assignedBy: "keyword" });
    }
    for (const match of accessMatches) {
      const existing = bestByBucket.get(match.bucketSlug);
      if (!existing || match.confidence > existing.match.confidence) {
        bestByBucket.set(match.bucketSlug, { match, assignedBy: "venue-accessibility" });
      }
    }

    const rows = Array.from(bestByBucket.values())
      .map(({ match, assignedBy }) => {
        const bucketId = bucketIdBySlug.get(match.bucketSlug);
        if (!bucketId) return null;
        if (lockedPairs.has(`${event.id}:${bucketId}`)) return null;
        return {
          event_id: event.id,
          bucket_id: bucketId,
          confidence: match.confidence,
          evidence: match.evidence,
          // A match this certain skips the manual admin review queue —
          // written straight in as "moderator" (the same state a human
          // approval sets) rather than sitting there as one more row to
          // click through. See lib/buckets.ts's AUTO_APPROVE_THRESHOLD.
          assigned_by: match.confidence >= AUTO_APPROVE_THRESHOLD ? "moderator" : assignedBy,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) continue;

    const { error } = await admin
      .from("event_buckets")
      .upsert(rows, { onConflict: "event_id,bucket_id" });

    if (error) {
      errors.push(`event ${event.id}: ${error.message}`);
    } else {
      eventsTagged += 1;
      bucketAssignments += rows.length;
    }
  }

  return { eventsProcessed: events.length, eventsTagged, bucketAssignments, errors };
}

export interface CategoryInferenceResult {
  eventsScanned: number;
  eventsUpdated: number;
  errors: string[];
}

// Backfills `category` on events where the source adapter left it null.
// Only updates rows where category IS NULL — source-set values are kept.
// Runs after classification so buckets are already assigned (no dependency,
// but the order keeps the ingest response logical).
export async function runCategoryInference(
  admin: AdminClient
): Promise<CategoryInferenceResult> {
  const events: { id: string; title: string; description: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select("id, title, description")
      .eq("status", "published")
      .eq("is_duplicate", false)
      .is("category", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let eventsUpdated = 0;
  const errors: string[] = [];

  for (const event of events) {
    const category = inferCategory(event.title, event.description);
    if (!category) continue;

    const { error } = await admin
      .from("events")
      .update({ category })
      .eq("id", event.id);

    if (error) {
      errors.push(`event ${event.id}: ${error.message}`);
    } else {
      eventsUpdated += 1;
    }
  }

  return { eventsScanned: events.length, eventsUpdated, errors };
}

export interface QualityScoringResult {
  eventsProcessed: number;
  scored: number;
  errors: string[];
}

export async function runQualityScoring(admin: AdminClient): Promise<QualityScoringResult> {
  const events: {
    id: string;
    title: string;
    description: string | null;
    venue_id: string | null;
    image_url: string | null;
  }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select("id, title, description, venue_id, image_url")
      .eq("status", "published")
      .eq("is_duplicate", false)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let scored = 0;
  const errors: string[] = [];

  for (const event of events) {
    const result = scoreEventQuality({
      title: event.title,
      description: event.description,
      venueId: event.venue_id,
      imageUrl: event.image_url,
    });

    const { error } = await admin
      .from("events")
      .update({ quality_score: result.score, quality_flags: result.flags })
      .eq("id", event.id);

    if (error) {
      errors.push(`event ${event.id}: ${error.message}`);
    } else {
      scored += 1;
    }
  }

  return { eventsProcessed: events.length, scored, errors };
}

export interface PruneResult {
  duplicatesRemoved: number;
  expiredRemoved: number;
  lowQualityRemoved: number;
}

// Deletes rows that quality/dedup/expiry only ever flagged, never removed —
// see supabase/migrations/0013_prune_events.sql for exactly what qualifies
// and why each grace period exists. Run last, after quality scoring, so
// is_duplicate/status/quality_score all reflect this run before anything
// gets deleted.
export async function runPrune(admin: AdminClient): Promise<PruneResult> {
  const { data, error } = await admin.rpc("prune_events");
  if (error) throw new Error(`Prune pass failed: ${error.message}`);
  const row = data?.[0] ?? {
    duplicates_removed: 0,
    expired_removed: 0,
    low_quality_removed: 0,
  };
  return {
    duplicatesRemoved: row.duplicates_removed ?? 0,
    expiredRemoved: row.expired_removed ?? 0,
    lowQualityRemoved: row.low_quality_removed ?? 0,
  };
}
