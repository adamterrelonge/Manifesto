"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/browser";

interface OrganiserOption {
  id: string;
  name: string;
  profile_url: string | null;
}

export default function ClaimPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrganiserOption[]>([]);
  const [selected, setSelected] = useState<OrganiserOption | null>(null);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const supabase = createBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user);
        setAuthChecked(true);
      });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase
          .from("organisers")
          .select("id, name, profile_url")
          .ilike("name", `%${query.trim()}%`)
          .limit(10);
        setResults((data as OrganiserOption[]) ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selected) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error: insertError } = await supabase.from("organiser_claims").insert({
        organiser_id: selected.id,
        user_id: user.id,
        claim_email: user.email ?? "",
        message: message.trim(),
      });

      if (insertError) {
        setError(
          insertError.code === "23505"
            ? "You already have a pending claim for this organiser."
            : insertError.message
        );
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return null;
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Claim your listing</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in first — open the account panel from the sidebar, then come back to this page.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Claim submitted</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We&rsquo;ll review it and email you at {user.email} once it&rsquo;s approved. Once
          approved you can edit your listing from{" "}
          <a href="/organiser/manage" className="underline underline-offset-4">
            /organiser/manage
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Claim your listing</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          If Manifesto has aggregated events from your organisation, you can claim the listing to
          edit its name and link. We review every claim manually before approving it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="organiser-search" className="text-sm font-medium text-black dark:text-zinc-50">
            Find your organisation
          </label>
          <input
            id="organiser-search"
            type="text"
            value={selected ? selected.name : query}
            onChange={(e) => {
              setSelected(null);
              setQuery(e.target.value);
            }}
            placeholder="Start typing an organiser name…"
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {!selected && results.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-zinc-200 p-1 dark:border-zinc-800">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r);
                      setResults([]);
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {r.name}
                    {r.profile_url && (
                      <span className="ml-2 text-xs text-zinc-500">{r.profile_url}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="claim-message" className="text-sm font-medium text-black dark:text-zinc-50">
            How can we verify this is you?
          </label>
          <textarea
            id="claim-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            placeholder="e.g. a link to a page on the organisation's own site listing you as a contact, or explain the connection"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!selected || loading}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Submitting…" : "Submit claim"}
        </button>
      </form>
    </div>
  );
}
