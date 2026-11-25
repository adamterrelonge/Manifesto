// The public gate — what decides whether an event is shown to users.
//
// Single source of truth shared by lib/events-query.ts (what the site
// renders) and lib/pipeline.ts's runYield (what the source-health report
// counts as "shown"). Keeping both on these helpers is what stops the
// report drifting from what users actually see. See docs/PROJECT_PLAN.md §9.

import { isGateQualifyingBucket, HIGH_CONFIDENCE_THRESHOLD } from "@/lib/buckets";

/** Days ahead the public feed covers. The sidebar's widest filter is "This
 *  Week" (7 days); +1 gives the client-side week filter, which computes
 *  "now" a moment later in the browser, a little headroom. */
export const PUBLIC_WINDOW_DAYS = 8;

export interface GateBucketRow {
  confidence: number;
  assigned_by: string;
  buckets: { slug: string } | null;
}

/** True when at least one tag makes the event public: (a) a gate-qualifying
 *  bucket — not cost-only (free-entry) or access-only (disability-friendly
 *  etc., see lib/buckets.ts ACCESS_ONLY_BUCKETS), (b) not moderator-rejected
 *  (rejected rows keep their original confidence, see
 *  0012_bucket_rejected_state.sql), and (c) high-confidence or
 *  moderator-approved. A low-confidence guess alone never makes an event
 *  public — it waits in the admin review queue. */
export function passesBucketGate(eventBuckets: GateBucketRow[]): boolean {
  return eventBuckets.some(
    (eb) =>
      eb.buckets !== null &&
      eb.assigned_by !== "rejected" &&
      isGateQualifyingBucket(eb.buckets.slug) &&
      (eb.confidence >= HIGH_CONFIDENCE_THRESHOLD || eb.assigned_by === "moderator")
  );
}

/** Date bounds of the public feed. Multi-day exhibitions that started
 *  before `now` but are still running qualify via end_at; point-in-time
 *  events with no end_at must start from `now` so finished ones don't
 *  linger. Use `liveFilter` with PostgREST's `.or()` and `horizonIso` with
 *  `.lt("start_at", …)`. */
export function publicWindow(now: Date = new Date()): { horizonIso: string; liveFilter: string } {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + PUBLIC_WINDOW_DAYS);
  const nowIso = now.toISOString();
  return {
    horizonIso: horizon.toISOString(),
    liveFilter: `end_at.gte.${nowIso},and(end_at.is.null,start_at.gte.${nowIso})`,
  };
}
