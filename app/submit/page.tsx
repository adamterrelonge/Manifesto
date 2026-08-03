"use client";

import { useState } from "react";
import { BUCKET_LABELS, NON_QUALIFYING_BUCKETS, type BucketSlug } from "@/lib/buckets";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";

const IDENTITY_BUCKETS = (Object.keys(BUCKET_LABELS) as BucketSlug[]).filter(
  (slug) => !NON_QUALIFYING_BUCKETS.includes(slug) && slug !== "free-entry"
);

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [Category, string][];

export default function SubmitPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venuePostcode, setVenuePostcode] = useState("");
  const [category, setCategory] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [selfBuckets, setSelfBuckets] = useState<Set<BucketSlug>>(new Set());
  const [trap, setTrap] = useState("");

  function toggleBucket(slug: BucketSlug) {
    setSelfBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          startDate,
          startTime: startTime || undefined,
          endDate: endDate || undefined,
          endTime: endTime || undefined,
          venueName: venueName || undefined,
          venueAddress: venueAddress || undefined,
          venueCity: venueCity || undefined,
          venuePostcode: venuePostcode || undefined,
          category: category || null,
          sourceUrl: sourceUrl || undefined,
          isFree,
          priceMin: !isFree && priceMin ? parseFloat(priceMin) : null,
          selfBuckets: [...selfBuckets],
          _trap: trap,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong — please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Thanks for the submission</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We&rsquo;ll review it shortly. Once approved it&rsquo;ll appear on the site. If you&rsquo;d like to
          submit another event,{" "}
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="underline underline-offset-4"
          >
            go back to the form
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Submit an event</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Know about an event that should be on Manifesto? Add it here — we review every submission
          before it goes live.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* ── Event details ── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium text-black dark:text-zinc-50">Event details</legend>

          <Field label="Event name" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. Black Joy Collective — Summer Social"
              className={inputCls}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="What is this event about? Who is it for?"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="End date">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              <option value="">— select if known —</option>
              {CATEGORIES.map(([slug, label]) => (
                <option key={slug} value={slug}>{label}</option>
              ))}
            </select>
          </Field>

          <Field label="Event link">
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>
        </fieldset>

        {/* ── Venue ── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium text-black dark:text-zinc-50">
            Venue <span className="font-normal text-zinc-500">(helps us show it on the map)</span>
          </legend>

          <Field label="Venue name">
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Hackney Wick Community Centre"
              className={inputCls}
            />
          </Field>

          <Field label="Address">
            <input
              type="text"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              maxLength={200}
              placeholder="Street address"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input
                type="text"
                value={venueCity}
                onChange={(e) => setVenueCity(e.target.value)}
                maxLength={200}
                placeholder="e.g. London"
                className={inputCls}
              />
            </Field>
            <Field label="Postcode">
              <input
                type="text"
                value={venuePostcode}
                onChange={(e) => setVenuePostcode(e.target.value)}
                maxLength={10}
                placeholder="e.g. E9 5LX"
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        {/* ── Cost ── */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-black dark:text-zinc-50">Cost</legend>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>Free entry</span>
          </label>

          {!isFree && (
            <Field label="Price from (£)">
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                min={0}
                step={0.01}
                placeholder="0.00"
                className={inputCls}
              />
            </Field>
          )}
        </fieldset>

        {/* ── Who is this for? ── */}
        <fieldset className="flex flex-col gap-3">
          <div>
            <legend className="text-sm font-medium text-black dark:text-zinc-50">
              Who is this event for?
            </legend>
            <p className="mt-0.5 text-xs text-zinc-500">
              Select all that apply — this helps us tag the event correctly.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {IDENTITY_BUCKETS.map((slug) => (
              <label key={slug} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selfBuckets.has(slug)}
                  onChange={() => toggleBucket(slug)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                <span>{BUCKET_LABELS[slug]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Honeypot — hidden from real users via display:none, bots fill it */}
        <input
          type="text"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          style={{ display: "none" }}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Submitting…" : "Submit event"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-600";
