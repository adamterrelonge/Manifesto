"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  fetchOpenBucketFlags,
  resolveBucketFlag,
  type OpenBucketFlagGroup,
} from "@/lib/moderation";

// Community moderation queue (docs/PROJECT_PLAN.md §13, Tier 1) — gated by
// the caller's real Supabase Auth session + profiles.is_trusted_moderator,
// checked server-side inside list_open_bucket_flags()/moderator_resolve_bucket_flag()
// (0016_bucket_flags_and_trust.sql). Deliberately not the shared-ADMIN_SECRET
// pattern /admin/review uses — trust here is per-person, not one shared password.
export default function ModeratePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<OpenBucketFlagGroup[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          setLoading(false);
          return;
        }
        setSignedIn(true);
        const rows = await fetchOpenBucketFlags();
        setGroups(rows);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleResolve(group: OpenBucketFlagGroup, status: "upheld" | "dismissed") {
    try {
      await resolveBucketFlag(group.event_id, group.bucket_id, status);
      setGroups((prev) =>
        prev.filter((g) => !(g.event_id === group.event_id && g.bucket_id === group.bucket_id))
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return <p className="px-6 py-12 text-sm text-zinc-500">Loading…</p>;
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to access the moderation queue.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <p className="mt-2 text-xs text-zinc-500">
          If you&rsquo;re not a trusted community moderator yet, this page isn&rsquo;t available
          to you.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        Community moderation queue ({groups.length})
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Events with a flagged bucket tag, most-reported first. Upholding a flag removes the tag
        permanently (same as an admin rejection); dismissing closes the reports and leaves the tag
        as-is.
      </p>

      {groups.length === 0 && <p className="text-sm text-zinc-500">No open reports.</p>}

      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li
            key={`${group.event_id}:${group.bucket_id}`}
            className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
                {group.event_title}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                  {group.bucket_label}
                </span>
                <span>
                  {group.flag_count} report{group.flag_count === 1 ? "" : "s"}
                </span>
                {group.latest_reason && <span>&ldquo;{group.latest_reason}&rdquo;</span>}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => handleResolve(group, "dismissed")}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleResolve(group, "upheld")}
                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
              >
                Uphold (remove tag)
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
