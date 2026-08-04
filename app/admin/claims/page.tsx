"use client";

import { useCallback, useEffect, useState } from "react";

// Same storage key as /admin/review and /admin/submissions — one login
// covers all three admin pages.
const SECRET_STORAGE_KEY = "manifesto_admin_secret";

interface Claim {
  id: string;
  claim_email: string;
  message: string;
  created_at: string;
  organisers: { id: string; name: string; profile_url: string | null; claimed_by: string | null } | null;
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

export default function AdminClaimsPage() {
  const [secret, setSecret] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(SECRET_STORAGE_KEY) : null
  );
  const [secretInput, setSecretInput] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async (currentSecret: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/claims", {
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
        setError(body.error ?? "Failed to load claims.");
        return;
      }
      setClaims(body.claims);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (secret) fetchClaims(secret);
  }, [secret, fetchClaims]);

  async function handleAction(id: string, action: "approve" | "reject") {
    if (!secret) return;
    const res = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ claimId: id, action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Action failed.");
      return;
    }
    setClaims((prev) => prev.filter((c) => c.id !== id));
  }

  if (!secret) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Admin — organiser claims</h1>
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
          Organiser claims ({claims.length})
        </h1>
        <button
          type="button"
          onClick={() => secret && fetchClaims(secret)}
          className="text-sm underline underline-offset-4"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Requests from signed-in users to claim an organiser listing. Verification is manual —
        check the message against the organiser&rsquo;s public profile URL before approving.
        Approving links the organiser to that user&rsquo;s account, letting them edit its name/URL
        from /organiser/manage.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && claims.length === 0 && (
        <p className="text-sm text-zinc-500">No pending claims.</p>
      )}

      <ul className="flex flex-col gap-4">
        {claims.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-black dark:text-zinc-50">
                  {c.organisers?.name ?? "(organiser missing)"}
                </p>

                <p className="mt-0.5 text-xs text-zinc-500">
                  Claimed by {c.claim_email} · Submitted {formatDateTime(c.created_at)}
                </p>

                {c.organisers?.claimed_by && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    ⚠ This organiser is already claimed by a different account — approving will
                    reassign it.
                  </p>
                )}

                {c.organisers?.profile_url && (
                  <a
                    href={c.organisers.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
                  >
                    {c.organisers.profile_url}
                  </a>
                )}

                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {c.message}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleAction(c.id, "approve")}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(c.id, "reject")}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                >
                  Reject
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
