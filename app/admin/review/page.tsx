"use client";

import { useCallback, useEffect, useState } from "react";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/buckets";

const SECRET_STORAGE_KEY = "manifesto_admin_secret";

interface ReviewRow {
  event_id: string;
  bucket_id: string;
  confidence: number;
  evidence: string | null;
  assigned_by: string;
  events: { title: string; start_at: string } | null;
  buckets: { slug: string; label: string } | null;
}

export default function AdminReviewPage() {
  // Synchronous read, no effect needed — sessionStorage is unavailable
  // during SSR, hence the window guard (this still matches on hydration
  // since the unauthenticated form renders identically either way).
  const [secret, setSecret] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SECRET_STORAGE_KEY) : null
  );
  const [secretInput, setSecretInput] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async (currentSecret: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/review", {
        headers: { Authorization: `Bearer ${currentSecret}` },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
        setSecret(null);
        setError("Incorrect secret.");
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to load review queue.");
        return;
      }
      setRows(body.rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // fetchRows sets state only inside its async body (after the fetch()
    // promise settles), not synchronously within this effect — safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (secret) fetchRows(secret);
  }, [secret, fetchRows]);

  async function handleAction(row: ReviewRow, action: "approve" | "reject") {
    if (!secret) return;
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ eventId: row.event_id, bucketId: row.bucket_id, action }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Action failed.");
      return;
    }
    if (action === "reject") {
      setRows((prev) =>
        prev.filter((r) => !(r.event_id === row.event_id && r.bucket_id === row.bucket_id))
      );
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.event_id === row.event_id && r.bucket_id === row.bucket_id
            ? { ...r, assigned_by: "moderator" }
            : r
        )
      );
    }
  }

  if (!secret) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Admin — bucket review</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem(SECRET_STORAGE_KEY, secretInput);
            setSecret(secretInput);
          }}
          className="flex flex-col gap-2"
        >
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="INGEST_SECRET"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Enter
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Bucket tag review ({rows.length})
        </h1>
        <button
          type="button"
          onClick={() => secret && fetchRows(secret)}
          className="text-sm underline underline-offset-4"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Sorted lowest confidence first. Rows below {HIGH_CONFIDENCE_THRESHOLD * 100}% are most
        worth checking. Approve confirms the tag (marks it moderator-reviewed); reject removes it.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const isLowConfidence = row.confidence < HIGH_CONFIDENCE_THRESHOLD;
          const isReviewed = row.assigned_by === "moderator";
          return (
            <li
              key={`${row.event_id}-${row.bucket_id}`}
              className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
                  {row.events?.title ?? "(deleted event)"}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                    {row.buckets?.label ?? row.buckets?.slug ?? "unknown bucket"}
                  </span>
                  <span className={isLowConfidence ? "text-amber-600" : ""}>
                    {Math.round(row.confidence * 100)}% confidence
                  </span>
                  <span>evidence: &quot;{row.evidence}&quot;</span>
                  <span>via {row.assigned_by}</span>
                  {isReviewed && <span className="text-green-600">✓ reviewed</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => handleAction(row, "approve")}
                  disabled={isReviewed}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(row, "reject")}
                  className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                >
                  Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
