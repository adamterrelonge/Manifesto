"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/browser";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";

interface Organiser {
  id: string;
  name: string;
  profile_url: string | null;
}

interface ManagedEvent {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  category: string | null;
  is_free: boolean;
  price_min: number | null;
  status: string;
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [Category, string][];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrganiserManagePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [organiser, setOrganiser] = useState<Organiser | null>(null);
  const [loadingOrganiser, setLoadingOrganiser] = useState(true);
  const [events, setEvents] = useState<ManagedEvent[]>([]);

  const [name, setName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>("");
  const [draftIsFree, setDraftIsFree] = useState(false);
  const [draftPriceMin, setDraftPriceMin] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [hidingId, setHidingId] = useState<string | null>(null);

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
    if (!user) return;
    (async () => {
      setLoadingOrganiser(true);
      try {
        const supabase = createBrowserClient();
        const { data } = await supabase
          .from("organisers")
          .select("id, name, profile_url")
          .eq("claimed_by", user.id)
          .maybeSingle();

        if (data) {
          setOrganiser(data as Organiser);
          setName((data as Organiser).name);
          setProfileUrl((data as Organiser).profile_url ?? "");

          const { data: eventRows } = await supabase
            .from("events")
            .select("id, title, description, start_at, category, is_free, price_min, status")
            .eq("organiser_id", (data as Organiser).id)
            .in("status", ["published", "flagged"])
            .order("start_at", { ascending: true })
            .limit(20);
          setEvents((eventRows as ManagedEvent[]) ?? []);
        }
      } finally {
        setLoadingOrganiser(false);
      }
    })();
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!organiser) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("claim_organiser_update", {
        p_organiser_id: organiser.id,
        p_name: name,
        p_profile_url: profileUrl,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setOrganiser({ ...organiser, name, profile_url: profileUrl });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(ev: ManagedEvent) {
    setEditingId(ev.id);
    setDraftTitle(ev.title);
    setDraftDescription(ev.description ?? "");
    setDraftCategory(ev.category ?? "");
    setDraftIsFree(ev.is_free);
    setDraftPriceMin(ev.price_min !== null ? String(ev.price_min) : "");
    setEventError(null);
  }

  async function handleEventSave(eventId: string) {
    setEventSaving(true);
    setEventError(null);
    try {
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("claim_organiser_update_event", {
        p_event_id: eventId,
        p_title: draftTitle,
        p_description: draftDescription,
        p_category: draftCategory || null,
        p_is_free: draftIsFree,
        p_price_min: draftIsFree || !draftPriceMin ? null : parseFloat(draftPriceMin),
        p_price_max: null,
      });
      if (rpcError) {
        setEventError(rpcError.message);
        return;
      }
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                title: draftTitle.trim() || ev.title,
                description: draftDescription.trim() || null,
                category: draftCategory || ev.category,
                is_free: draftIsFree,
                price_min: draftIsFree ? null : draftPriceMin ? parseFloat(draftPriceMin) : ev.price_min,
              }
            : ev
        )
      );
      setEditingId(null);
    } catch (err) {
      setEventError((err as Error).message);
    } finally {
      setEventSaving(false);
    }
  }

  async function handleHide(eventId: string) {
    setHidingId(eventId);
    setEventError(null);
    try {
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("claim_organiser_hide_event", {
        p_event_id: eventId,
      });
      if (rpcError) {
        setEventError(rpcError.message);
        return;
      }
      setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, status: "flagged" } : ev)));
    } catch (err) {
      setEventError((err as Error).message);
    } finally {
      setHidingId(null);
    }
  }

  async function handleUnhide(eventId: string) {
    setHidingId(eventId);
    setEventError(null);
    try {
      const supabase = createBrowserClient();
      const { error: rpcError } = await supabase.rpc("claim_organiser_unhide_event", {
        p_event_id: eventId,
      });
      if (rpcError) {
        setEventError(rpcError.message);
        return;
      }
      setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, status: "published" } : ev)));
    } catch (err) {
      setEventError((err as Error).message);
    } finally {
      setHidingId(null);
    }
  }

  if (!authChecked || (user && loadingOrganiser)) {
    return null;
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Manage your listing</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign in first — open the account panel from the sidebar, then come back to this page.
        </p>
      </div>
    );
  }

  if (!organiser) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Manage your listing</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You don&rsquo;t have a claimed organiser yet.{" "}
          <a href="/claim" className="underline underline-offset-4">
            Submit a claim
          </a>{" "}
          and we&rsquo;ll review it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Manage your listing</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          You&rsquo;re verified as the owner of this organiser. Updates here don&rsquo;t affect
          past-ingested event copy — only the organiser profile itself.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="organiser-name" className="text-sm font-medium text-black dark:text-zinc-50">
            Display name
          </label>
          <input
            id="organiser-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="organiser-url" className="text-sm font-medium text-black dark:text-zinc-50">
            Profile URL
          </label>
          <input
            id="organiser-url"
            type="url"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">Saved.</p>}

        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div>
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          Your events ({events.length})
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Edit an event&rsquo;s details, or hide one you no longer want listed — hidden events can
          be unhidden any time and are never deleted outright. Rescheduling (dates) isn&rsquo;t
          editable here yet.
        </p>

        {eventError && <p className="mt-2 text-sm text-red-600">{eventError}</p>}

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No events found.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {events.map((ev) =>
              editingId === ev.id ? (
                <li
                  key={ev.id}
                  className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <textarea
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    rows={3}
                    placeholder="Description"
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <select
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">No category</option>
                    {CATEGORY_OPTIONS.map(([slug, label]) => (
                      <option key={slug} value={slug}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draftIsFree}
                      onChange={(e) => setDraftIsFree(e.target.checked)}
                    />
                    Free entry
                  </label>
                  {!draftIsFree && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftPriceMin}
                      onChange={(e) => setDraftPriceMin(e.target.value)}
                      placeholder="Price (£)"
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEventSave(ev.id)}
                      disabled={eventSaving}
                      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      {eventSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={ev.id} className="flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-zinc-700 dark:text-zinc-300">
                      {ev.title}
                      {ev.status === "flagged" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Hidden
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-500">{formatDate(ev.start_at)}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {ev.status === "flagged" ? (
                      <button
                        type="button"
                        onClick={() => handleUnhide(ev.id)}
                        disabled={hidingId === ev.id}
                        className="text-xs underline underline-offset-4 disabled:opacity-50"
                      >
                        {hidingId === ev.id ? "Unhiding…" : "Unhide"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(ev)}
                          className="text-xs underline underline-offset-4"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHide(ev.id)}
                          disabled={hidingId === ev.id}
                          className="text-xs text-red-700 underline underline-offset-4 disabled:opacity-50 dark:text-red-400"
                        >
                          {hidingId === ev.id ? "Hiding…" : "Hide"}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
