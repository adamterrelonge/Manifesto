-- Prune pass: deletes rows that are permanently excluded from every public
-- query (see 0007_expiry.sql / 0002_dedup.sql / lib/quality.ts) so ~28
-- sources re-scraping on a schedule doesn't grow `events` without bound —
-- previously quality/dedup/expiry only ever *flagged* rows, never removed
-- them (docs/PROJECT_PLAN.md §3 goal 8's "unbounded row growth" gap).
-- Run via runPrune() in lib/pipeline.ts, wired into GET /api/ingest after
-- quality scoring so is_duplicate/status/quality_score are all fresh for
-- this run.
--
-- Claimed organisers can read their own events regardless of status
-- (0011_organiser_event_edits_v2.sql, "Claimed organisers can read their
-- own events" policy) so every branch below excludes events belonging to a
-- claimed organiser — a duplicate/expired/low-quality event still needs to
-- stay manageable for the organiser who claimed it, even though it's
-- invisible to the public.
create or replace function prune_events(
  expired_retention_days integer default 30,
  low_quality_grace_days integer default 3
) returns table (
  duplicates_removed integer,
  expired_removed integer,
  low_quality_removed integer
)
language plpgsql
as $$
declare
  v_duplicates integer;
  v_expired integer;
  v_low_quality integer;
begin
  -- Confirmed cross-source duplicates (run_event_dedup already flagged
  -- these; the canonical row they point at via dedup_group_id stays).
  -- Safe to remove immediately: if the same source re-sends this event on
  -- a future ingest, upsertNormalisedEvent just re-inserts and re-dedups
  -- it, so this never grows past however many real duplicates exist in
  -- the current source set.
  delete from events
  where is_duplicate = true
    and (organiser_id is null or organiser_id not in (
      select id from organisers where claimed_by is not null
    ));
  get diagnostics v_duplicates = row_count;

  -- Events whose run ended more than expired_retention_days ago. The
  -- retention window (default 30 days) keeps a short buffer for support/
  -- debugging rather than deleting the moment expire_ended_events flips
  -- status, per the coalesce(end_at, start_at) rule that function itself
  -- uses.
  delete from events
  where status = 'expired'
    and coalesce(end_at, start_at) < now() - (expired_retention_days || ' days')::interval
    and (organiser_id is null or organiser_id not in (
      select id from organisers where claimed_by is not null
    ));
  get diagnostics v_expired = row_count;

  -- Sub-threshold quality scores never surface (app/page.tsx gates on
  -- quality_score >= QUALITY_THRESHOLD from lib/quality.ts — keep this
  -- literal in sync with that constant). low_quality_grace_days (default
  -- 3) gives a couple of ingest cycles for venue-matching/description
  -- fixes to raise the score before the row is deleted outright.
  --
  -- Keyed off created_at, not scraped_at: upsertNormalisedEvent resets
  -- scraped_at to now() on every re-ingest a source still returns the
  -- event, so a persistently low-quality row from an actively-scraped
  -- source would never age past the grace window and this branch would
  -- never fire for exactly the junk it exists to catch. created_at is set
  -- once on insert and never touched by the upsert, so it actually tracks
  -- how long the row has sat below threshold.
  delete from events
  where status = 'published'
    and is_duplicate = false
    and quality_score is not null
    and quality_score < 0.5
    and created_at < now() - (low_quality_grace_days || ' days')::interval
    and (organiser_id is null or organiser_id not in (
      select id from organisers where claimed_by is not null
    ));
  get diagnostics v_low_quality = row_count;

  return query select v_duplicates, v_expired, v_low_quality;
end;
$$;
