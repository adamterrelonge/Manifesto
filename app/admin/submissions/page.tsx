"use client";

import { useCallback, useEffect, useState } from "react";

// Same storage key as /admin/review — one login covers both admin pages.
const SECRET_STORAGE_KEY = "manifesto_admin_secret";

interface SubmissionBucket {
  confidence: number;
  assigned_by: string;
  buckets: { slug: string; label: string } | null;
}

interface Submission {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_free: boolean;
  price_min: number | null;
  source_url: string | null;
  quality_score: number | null;
  quality_flags: string[] | null;
  created_at: string;
  venues: { name: string; address: string | null; city: string | null; postcode: string | null } | null;
  event_buckets: SubmissionBucket[];
}

interface OrganiserSubmission {
  id: string;
  name: string;
  profile_url: string | null;
  bio: string | null;
  created_at: string;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminSubmissionsPage() {
  const [secret, setSecret] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SECRET_STORAGE_KEY) : null
  );
  const [secretInput, setSecretInput] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [organiserSubmissions, setOrganiserSubmissions] = useState<OrganiserSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async (currentSecret: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/submissions", {
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
        setError(body.error ?? "Failed to load submissions.");
        return;
      }
      setSubmissions(body.submissions);
      setOrganiserSubmissions(body.organiserSubmissions ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (secret) fetchSubmissions(secret);
  }, [secret, fetchSubmissions]);

  async function handleAction(id: string, action: "approve" | "reject") {
    if (!secret) return;
    const res = await fetch("/api/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ eventId: id, action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Action failed.");
      return;
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleOrganiserAction(id: string, action: "approve" | "reject") {
    if (!secret) return;
    const res = await fetch("/api/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ organiserId: id, action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Action failed.");
      return;
    }
    setOrganiserSubmissions((prev) => prev.filter((s) => s.id !== id));
  }

  if (!secret) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Admin — submissions</h1>
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
          Community submissions ({submissions.length + organiserSubmissions.length})
        </h1>
        <button
          type="button"
          onClick={() => secret && fetchSubmissions(secret)}
          className="text-sm underline underline-offset-4"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Events submitted via /submit. Approve to publish; reject to delete. Self-tagged buckets
        (confidence 1.0) pass the visibility gate immediately after approval. Submissions made via
        the &ldquo;link&rdquo; mode carry a placeholder title/date — visit the source link and
        confirm the real details before approving.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && submissions.length === 0 && (
        <p className="text-sm text-zinc-500">No pending submissions.</p>
      )}

      <ul className="flex flex-col gap-4">
        {submissions.map((s) => {
          const qualityOk = s.quality_score !== null && s.quality_score >= 0.5;
          const buckets = s.event_buckets.filter((eb) => eb.buckets);
          const hasQualifyingBucket = buckets.some(
            (eb) => eb.confidence >= 0.8 || eb.assigned_by === "moderator"
          );
          const dateUnconfirmed = (s.quality_flags ?? []).some((f) => f.startsWith("date not provided"));

          return (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-black dark:text-zinc-50">{s.title}</p>

                  <p className="mt-0.5 text-xs text-zinc-500">
                    Submitted {formatDate(s.created_at)}
                    {" · "}
                    {dateUnconfirmed ? (
                      <span className="text-amber-600 dark:text-amber-400">date unconfirmed — see link</span>
                    ) : (
                      <>
                        Starts {formatDateTime(s.start_at)}
                        {s.end_at && ` · Ends ${formatDateTime(s.end_at)}`}
                      </>
                    )}
                  </p>

                  {s.venues && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {[s.venues.name, s.venues.address, s.venues.city, s.venues.postcode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}

                  {s.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">
                      {s.description}
                    </p>
                  )}

                  {s.source_url && (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
                    >
                      {s.source_url}
                    </a>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleAction(s.id, "approve")}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(s.id, "reject")}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {/* Quality and bucket tags */}
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={[
                    "rounded px-1.5 py-0.5 text-xs",
                    qualityOk
                      ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  ].join(" ")}
                >
                  quality {s.quality_score !== null ? Math.round(s.quality_score * 100) : "?"}%
                  {!qualityOk && " ⚠"}
                </span>

                {!hasQualifyingBucket && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    no qualifying bucket — won&rsquo;t appear until tagged ⚠
                  </span>
                )}

                {s.is_free && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    free
                  </span>
                )}

                {buckets.map((eb) => (
                  <span
                    key={eb.buckets!.slug}
                    className={[
                      "rounded px-1.5 py-0.5 text-xs",
                      eb.assigned_by === "organiser"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    {eb.buckets!.label}{" "}
                    <span className="opacity-60">
                      {eb.assigned_by === "organiser"
                        ? "self-tagged"
                        : `${Math.round(eb.confidence * 100)}%`}
                    </span>
                  </span>
                ))}
              </div>

              {s.quality_flags && s.quality_flags.length > 0 && (
                <p className="text-xs text-zinc-400">
                  Quality flags: {s.quality_flags.join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Organiser signups ({organiserSubmissions.length})
        </h2>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        People who submitted themselves via the &ldquo;Be an organiser&rdquo; option on /submit.
        Approve to make their profile publicly visible and claimable.
      </p>

      {!loading && organiserSubmissions.length === 0 && (
        <p className="text-sm text-zinc-500">No pending organiser signups.</p>
      )}

      <ul className="flex flex-col gap-4">
        {organiserSubmissions.map((o) => (
          <li
            key={o.id}
            className="flex items-start justify-between gap-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-black dark:text-zinc-50">{o.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Submitted {formatDate(o.created_at)}</p>

              {o.profile_url && (
                <a
                  href={o.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
                >
                  {o.profile_url}
                </a>
              )}

              {o.bio && (
                <p className="mt-2 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">{o.bio}</p>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOrganiserAction(o.id, "approve")}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleOrganiserAction(o.id, "reject")}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
