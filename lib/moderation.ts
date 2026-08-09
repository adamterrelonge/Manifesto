// Client-side helpers for the report/flag pipeline and community-moderation
// queue added in supabase/migrations/0016_bucket_flags_and_trust.sql
// (docs/PROJECT_PLAN.md §13, Tier 1). Reporting a flag is a direct table
// insert under RLS, same no-API-route pattern as lib/favourites.ts; the
// moderation queue itself goes through security-definer RPCs since it needs
// to read/act across every user's flags, not just the caller's own.

import { createBrowserClient } from "@/lib/supabase/browser";

export async function flagBucketTag(
  userId: string,
  eventId: string,
  bucketId: string,
  reason?: string
): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.from("event_bucket_flags").insert({
    reporter_id: userId,
    event_id: eventId,
    bucket_id: bucketId,
    reason: reason ?? null,
  });
}

export async function fetchIsTrustedModerator(userId: string): Promise<boolean> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_trusted_moderator")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.is_trusted_moderator;
}

export interface OpenBucketFlagGroup {
  event_id: string;
  bucket_id: string;
  event_title: string;
  bucket_label: string;
  bucket_slug: string;
  flag_count: number;
  latest_reason: string | null;
  first_flagged_at: string;
}

export async function fetchOpenBucketFlags(): Promise<OpenBucketFlagGroup[]> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.rpc("list_open_bucket_flags");
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenBucketFlagGroup[];
}

export async function resolveBucketFlag(
  eventId: string,
  bucketId: string,
  status: "upheld" | "dismissed"
): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase.rpc("moderator_resolve_bucket_flag", {
    p_event_id: eventId,
    p_bucket_id: bucketId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
