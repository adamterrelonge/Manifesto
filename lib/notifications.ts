import { createAdminClient } from "@/lib/supabase/admin";
import { haversineDistanceKm } from "@/lib/geo";
import { sendNotificationDigestEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

// Same 1000-row PostgREST cap as lib/pipeline.ts's PAGE_SIZE — every
// paginated read below needs it for the same reason.
const PAGE_SIZE = 1000;

// How far back to look for "new" events each run. Matches the ~daily
// ingest cadence with headroom for a missed run; the event_notifications
// unique constraint (see 0015_notification_delivery.sql) is the real
// dedup guarantee, this window is just a cost bound so the pass doesn't
// rescan the whole published events table every time it runs.
const LOOKBACK_HOURS = 48;

interface CandidateEventRow {
  id: string;
  title: string;
  start_at: string;
  source_url: string | null;
  venues: { id: string; name: string; lat: number | null; lng: number | null } | null;
  event_buckets: { bucket_id: string; assigned_by: string }[];
}

interface Match {
  userId: string;
  eventId: string;
  bucketId: string;
}

export interface NotificationDeliveryResult {
  usersWithPreferences: number;
  candidateEvents: number;
  matchesQueued: number;
  digestsSent: number;
  errors: string[];
}

// Matches recently-published events against saved bucket preferences +
// (optional) home location/radius, then emails one digest per user
// covering everything newly matched this run. See docs/PROJECT_PLAN.md
// Phase 5 — this is the "storage-only so far" gap the notification
// preferences (0014_favourites_and_preferences.sql) were left with.
export async function runNotificationDelivery(admin: AdminClient): Promise<NotificationDeliveryResult> {
  const errors: string[] = [];

  const prefsByUser = new Map<string, Set<string>>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("profile_notification_buckets")
      .select("user_id, bucket_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Loading notification prefs failed: ${error.message}`);
    for (const row of (data ?? []) as { user_id: string; bucket_id: string }[]) {
      const set = prefsByUser.get(row.user_id) ?? new Set<string>();
      set.add(row.bucket_id);
      prefsByUser.set(row.user_id, set);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  if (prefsByUser.size === 0) {
    return { usersWithPreferences: 0, candidateEvents: 0, matchesQueued: 0, digestsSent: 0, errors };
  }

  const userIds = [...prefsByUser.keys()];

  // Home location + radius are optional — a user who hasn't set one still
  // gets bucket-only matching (no location narrowing), per the Phase 5
  // scope decision that radius is an opt-in refinement, not a requirement.
  const locationByUser = new Map<string, { lat: number; lng: number; radiusKm: number }>();
  const CHUNK = 200;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("profiles")
      .select("id, home_lat, home_lng, travel_radius_km")
      .in("id", chunk);
    if (error) throw new Error(`Loading profile locations failed: ${error.message}`);
    for (const row of (data ?? []) as {
      id: string;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number | null;
    }[]) {
      if (row.home_lat != null && row.home_lng != null && row.travel_radius_km != null) {
        locationByUser.set(row.id, {
          lat: row.home_lat,
          lng: row.home_lng,
          radiusKm: row.travel_radius_km,
        });
      }
    }
  }

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const events: CandidateEventRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("events")
      .select(
        "id, title, start_at, source_url, venues(id, name, lat, lng), event_buckets(bucket_id, assigned_by)"
      )
      .eq("status", "published")
      .eq("is_duplicate", false)
      .gte("created_at", since)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Loading candidate events failed: ${error.message}`);
    events.push(...((data ?? []) as unknown as CandidateEventRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const matches: Match[] = [];
  for (const event of events) {
    // A 'rejected' assigned_by is a moderator decision that the tag doesn't
    // apply (see 0012_bucket_rejected_state.sql) — it must never count as a
    // match, even though the row still exists in event_buckets.
    const matchedBucketIds = event.event_buckets
      .filter((b) => b.assigned_by !== "rejected")
      .map((b) => b.bucket_id);
    if (matchedBucketIds.length === 0) continue;

    for (const userId of userIds) {
      const subscribedBuckets = prefsByUser.get(userId)!;
      const matchedBucketId = matchedBucketIds.find((id) => subscribedBuckets.has(id));
      if (!matchedBucketId) continue;

      const location = locationByUser.get(userId);
      if (location) {
        const venue = event.venues;
        if (!venue || venue.lat == null || venue.lng == null) continue;
        const distanceKm = haversineDistanceKm(location.lat, location.lng, venue.lat, venue.lng);
        if (distanceKm > location.radiusKm) continue;
      }

      matches.push({ userId, eventId: event.id, bucketId: matchedBucketId });
    }
  }

  if (matches.length === 0) {
    return {
      usersWithPreferences: prefsByUser.size,
      candidateEvents: events.length,
      matchesQueued: 0,
      digestsSent: 0,
      errors,
    };
  }

  // ON CONFLICT DO NOTHING (ignoreDuplicates) + .select() hands back only
  // the rows that were actually inserted — this is what makes the pass
  // idempotent. A user already notified about an event on a prior run
  // (even via a different matching bucket that run) is silently skipped
  // here instead of getting a duplicate email.
  const { data: insertedRows, error: insertError } = await admin
    .from("event_notifications")
    .upsert(
      matches.map((m) => ({ user_id: m.userId, event_id: m.eventId, bucket_id: m.bucketId })),
      { onConflict: "user_id,event_id", ignoreDuplicates: true }
    )
    .select("user_id, event_id");
  if (insertError) throw new Error(`Recording notifications failed: ${insertError.message}`);

  const newlyMatchedByUser = new Map<string, Set<string>>();
  for (const row of (insertedRows ?? []) as { user_id: string; event_id: string }[]) {
    const set = newlyMatchedByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.event_id);
    newlyMatchedByUser.set(row.user_id, set);
  }

  const eventById = new Map(events.map((e) => [e.id, e]));

  // Counts digest calls made, not confirmed-delivered emails —
  // sendNotificationDigestEmail swallows its own send errors and no-ops
  // without RESEND_API_KEY, the same best-effort contract
  // sendClaimApprovedEmail already uses elsewhere in this file, so an
  // unconfigured/failed send never fails this whole pass.
  let digestsSent = 0;
  for (const [userId, eventIds] of newlyMatchedByUser) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) {
      errors.push(`user ${userId}: no email on file (${userError?.message ?? "unknown"})`);
      continue;
    }

    const digestEvents = [...eventIds]
      .map((id) => eventById.get(id))
      .filter((e): e is CandidateEventRow => e !== undefined)
      .map((e) => ({
        title: e.title,
        startAt: e.start_at,
        venueName: e.venues?.name ?? null,
        sourceUrl: e.source_url,
      }));

    await sendNotificationDigestEmail(userData.user.email, digestEvents);
    digestsSent += 1;
  }

  return {
    usersWithPreferences: prefsByUser.size,
    candidateEvents: events.length,
    matchesQueued: matches.length,
    digestsSent,
    errors,
  };
}
