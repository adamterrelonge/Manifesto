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

type GroupStatus = "pending" | "approved" | "rejected";

// Events with the same title and bucket are collapsed into one group so the
// user can approve/reject all occurrences (e.g. a weekly screening, a multi-
// day exhibition ingested per-day) with a single click.
interface ReviewGroup {
  key: string;
  title: string;
  bucketId: string;
  bucketLabel: string;
  minConfidence: number;
  evidence: string;
  rows: ReviewRow[];
  status: GroupStatus;
}

// "Approve all"/"reject all" apply to every row in a group atomically, so a
// group's rows only ever end up mixed transiently — treat any row still
// awaiting a decision as making the whole group "pending" so it's never
// silently hidden from the queue.
function groupStatus(rows: ReviewRow[]): GroupStatus {
  if (rows.every((r) => r.assigned_by === "moderator")) return "approved";
  if (rows.every((r) => r.assigned_by === "rejected")) return "rejected";
  return "pending";
}

function buildGroups(rows: ReviewRow[]): ReviewGroup[] {
  const map = new Map<string, ReviewRow[]>();

  for (const row of rows) {
    const title = row.events?.title ?? "(deleted event)";
    const key = `${title}::${row.bucket_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return [...map.entries()].map(([key, groupRows]) => {
    const first = groupRows[0];
    return {
      key,
      title: first.events?.title ?? "(deleted event)",
      bucketId: first.bucket_id,
      bucketLabel: first.buckets?.label ?? first.buckets?.slug ?? "unknown bucket",
      minConfidence: Math.min(...groupRows.map((r) => r.confidence)),
      evidence: first.evidence ?? "",
      rows: groupRows,
      status: groupStatus(groupRows),
    };
  });
}

const TABS: { key: GroupStatus; label: string }[] = [
  { key: "pending", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminReviewPage() {
  const [secret, setSecret] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SECRET_STORAGE_KEY) : null
  );
  const [secretInput, setSecretInput] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderatorEmail, setModeratorEmail] = useState("");
  const [moderatorStatus, setModeratorStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<GroupStatus>("pending");

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (secret) fetchRows(secret);
  }, [secret, fetchRows]);

  async function applyAction(row: ReviewRow, action: "approve" | "reject"): Promise<boolean> {
    if (!secret) return false;
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ eventId: row.event_id, bucketId: row.bucket_id, action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Action failed.");
    }
    return res.ok;
  }

  async function handleGroupAction(group: ReviewGroup, action: "approve" | "reject") {
    const results = await Promise.allSettled(
      group.rows.map((row) => applyAction(row, action))
    );

    const failedCount = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value)
    ).length;

    if (failedCount > 0) {
      setError(`${failedCount} of ${group.rows.length} row(s) failed — refresh to retry.`);
      return;
    }

    const affectedIds = new Set(group.rows.map((r) => r.event_id));
    const newAssignedBy = action === "reject" ? "rejected" : "moderator";
    setRows((prev) =>
      prev.map((r) =>
        affectedIds.has(r.event_id) && r.bucket_id === group.bucketId
          ? { ...r, assigned_by: newAssignedBy }
          : r
      )
    );
  }

  async function setModeratorTrust(trusted: boolean) {
    if (!secret || !moderatorEmail.trim()) return;
    setModeratorStatus(null);
    try {
      const res = await fetch("/api/admin/moderators", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ email: moderatorEmail.trim(), trusted }),
      });
      const body = await res.json().catch(() => ({}));
      setModeratorStatus(
        res.ok
          ? `${trusted ? "Granted" : "Revoked"} trusted-moderator status for ${moderatorEmail.trim()}.`
          : ((body as { error?: string }).error ?? "Failed.")
      );
    } catch (err) {
      setModeratorStatus((err as Error).message);
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
          <label htmlFor="admin-secret" className="text-sm text-zinc-600 dark:text-zinc-400">
            Admin secret
          </label>
          <input
            id="admin-secret"
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="ADMIN_SECRET"
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

  const allGroups = buildGroups(rows);
  const tabCounts: Record<GroupStatus, number> = {
    pending: allGroups.filter((g) => g.status === "pending").length,
    approved: allGroups.filter((g) => g.status === "approved").length,
    rejected: allGroups.filter((g) => g.status === "rejected").length,
  };
  const groups = allGroups.filter((g) => g.status === tab);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Bucket tag review</h1>
        <button
          type="button"
          onClick={() => secret && fetchRows(secret)}
          className="text-sm underline underline-offset-4"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-black text-black dark:border-white dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-200",
            ].join(" ")}
          >
            {t.label} ({tabCounts[t.key]})
          </button>
        ))}
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {tab === "pending"
          ? `Events with the same title and bucket are grouped — use "Approve all" to confirm every occurrence at once. Sorted lowest confidence first; below ${HIGH_CONFIDENCE_THRESHOLD * 100}% is worth checking.`
          : `Groups you've already ${tab === "approved" ? "approved" : "rejected"} — kept here so the queue above stops resurfacing them.`}
      </p>

      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-medium text-black dark:text-zinc-50">
          Grant/revoke community moderator trust
        </p>
        <p className="text-xs text-zinc-500">
          Trusted users get access to the community flag queue at{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">/moderate</code>.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={moderatorEmail}
            onChange={(e) => setModeratorEmail(e.target.value)}
            placeholder="user@example.com"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => setModeratorTrust(true)}
            disabled={!moderatorEmail.trim()}
            className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
          >
            Grant
          </button>
          <button
            type="button"
            onClick={() => setModeratorTrust(false)}
            disabled={!moderatorEmail.trim()}
            className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
          >
            Revoke
          </button>
        </div>
        {moderatorStatus && <p className="text-xs text-zinc-500">{moderatorStatus}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {groups.length === 0 && !loading && (
        <p className="text-sm text-zinc-500">Nothing here.</p>
      )}

      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const isLowConfidence = group.minConfidence < HIGH_CONFIDENCE_THRESHOLD;
          const isGrouped = group.rows.length > 1;

          return (
            <li
              key={group.key}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-black dark:text-zinc-50">
                    {group.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {group.bucketLabel}
                    </span>
                    <span className={isLowConfidence ? "text-amber-600" : ""}>
                      {Math.round(group.minConfidence * 100)}% confidence
                    </span>
                    <span>evidence: &ldquo;{group.evidence}&rdquo;</span>
                    {isGrouped && (
                      <span className="text-zinc-400">{group.rows.length} occurrences</span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {group.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => handleGroupAction(group, "approve")}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
                    >
                      {group.status === "rejected" ? "Move to approved" : isGrouped ? "Approve all" : "Approve"}
                    </button>
                  )}
                  {group.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => handleGroupAction(group, "reject")}
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                    >
                      {group.status === "approved" ? "Move to rejected" : isGrouped ? "Reject all" : "Reject"}
                    </button>
                  )}
                </div>
              </div>

              {/* Show individual dates only when grouped */}
              {isGrouped && (
                <div className="flex flex-wrap gap-1">
                  {group.rows.map((row) => (
                    <span
                      key={row.event_id}
                      className={[
                        "rounded px-1.5 py-0.5 text-xs",
                        row.assigned_by === "moderator"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                      ].join(" ")}
                    >
                      {row.events?.start_at ? formatDate(row.events.start_at) : "—"}
                      {row.assigned_by === "moderator" ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
