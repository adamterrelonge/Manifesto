-- Phase 1: cross-source dedup.
-- Run this in the Supabase SQL editor after 0001_init.sql.

create extension if not exists pg_trgm;

alter table events add column if not exists is_duplicate boolean not null default false;
create index if not exists events_is_duplicate_idx on events (is_duplicate);

create index if not exists venues_name_trgm_idx on venues using gin (name gin_trgm_ops);
create index if not exists events_title_trgm_idx on events using gin (title gin_trgm_ops);

-- Fuzzy venue match: same postcode OR near-identical coordinates, plus a
-- trigram name similarity threshold. Called from lib/ingest.ts at ingestion
-- time so the same real-world venue collapses to one row even when two
-- sources spell/format its name slightly differently.
create or replace function find_matching_venue(
  p_name text,
  p_postcode text,
  p_lat double precision,
  p_lng double precision
) returns uuid
language sql
stable
as $$
  select id from venues
  where
    (p_postcode is not null and postcode = p_postcode and similarity(name, p_name) > 0.4)
    or (
      p_lat is not null and p_lng is not null
      and lat is not null and lng is not null
      and abs(lat - p_lat) < 0.003 and abs(lng - p_lng) < 0.003
      and similarity(name, p_name) > 0.4
    )
  order by similarity(name, p_name) desc
  limit 1;
$$;

-- Batch pass over published, not-yet-flagged events: same venue + start
-- times within `window_hours` of each other + similar titles are treated as
-- the same real-world event. The lower-id event is kept canonical; the
-- other is flagged is_duplicate and points dedup_group_id at the canonical
-- row's id (no separate group-id column needed). Run via POST /api/dedup
-- after ingesting from a new source.
create or replace function run_event_dedup(
  window_hours numeric default 3,
  title_threshold numeric default 0.45
) returns integer
language plpgsql
as $$
declare
  matched_count integer := 0;
  rec record;
begin
  for rec in
    select e1.id as dup_id, e2.id as canonical_id
    from events e1
    join events e2
      on e1.venue_id = e2.venue_id
      and e1.id > e2.id
      and e1.status = 'published' and e2.status = 'published'
      and e1.is_duplicate = false and e2.is_duplicate = false
      and e1.venue_id is not null
      and abs(extract(epoch from (e1.start_at - e2.start_at))) <= window_hours * 3600
      and similarity(e1.title, e2.title) > title_threshold
  loop
    update events
      set is_duplicate = true, dedup_group_id = rec.canonical_id
      where id = rec.dup_id;
    matched_count := matched_count + 1;
  end loop;

  return matched_count;
end;
$$;
