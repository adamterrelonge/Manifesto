import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEventBuckets } from "@/lib/buckets";
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

  const events: { id: string; title: string; description: string | null; is_free: boolean }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select("id, title, description, is_free")
      .eq("status", "published")
      .eq("is_duplicate", false)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let eventsTagged = 0;
  let bucketAssignments = 0;
  const errors: string[] = [];

  for (const event of events) {
    const matches = classifyEventBuckets({
      title: event.title,
      description: event.description,
      isFree: event.is_free,
    });
    if (matches.length === 0) continue;

    const rows = matches
      .map((match) => {
        const bucketId = bucketIdBySlug.get(match.bucketSlug);
        if (!bucketId) return null;
        return {
          event_id: event.id,
          bucket_id: bucketId,
          confidence: match.confidence,
          evidence: match.evidence,
          assigned_by: "keyword",
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
