-- Fixes venue dedup being too strict on street-suffix abbreviations
-- ("11 Water Street" vs "11 Water St"): pg_trgm similarity() compares raw
-- character trigrams, and "Street" vs "St" diverge enough to fall below the
-- match threshold even though they're the same word. Normalizing common
-- address-suffix abbreviations (only when they're the LAST word, so "St
-- James's Park" isn't mangled into "Street James's Park") fixes this for
-- both future ingestion and already-split venues.
--
-- Run this in the Supabase SQL editor after 0001_init.sql and 0002_dedup.sql.

create or replace function normalize_venue_text(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text := trim(regexp_replace(lower(coalesce(input, '')), '\s+', ' ', 'g'));
  pairs text[][] := array[
    array['st', 'street'], array['rd', 'road'], array['ave', 'avenue'],
    array['ln', 'lane'], array['dr', 'drive'], array['pl', 'place'],
    array['sq', 'square'], array['ct', 'court'], array['cl', 'close'],
    array['gdns', 'gardens'], array['cres', 'crescent']
  ];
  pair text[];
begin
  foreach pair slice 1 in array pairs loop
    result := regexp_replace(result, '\m' || pair[1] || '\M$', pair[2]);
  end loop;
  return result;
end;
$$;

drop index if exists venues_name_trgm_idx;
create index venues_name_trgm_idx on venues using gin (normalize_venue_text(name) gin_trgm_ops);

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
    (p_postcode is not null and postcode = p_postcode
      and similarity(normalize_venue_text(name), normalize_venue_text(p_name)) > 0.4)
    or (
      p_lat is not null and p_lng is not null
      and lat is not null and lng is not null
      and abs(lat - p_lat) < 0.003 and abs(lng - p_lng) < 0.003
      and similarity(normalize_venue_text(name), normalize_venue_text(p_name)) > 0.4
    )
  order by similarity(normalize_venue_text(name), normalize_venue_text(p_name)) desc
  limit 1;
$$;

-- One-time (and re-runnable) backfill: merges venues that already got split
-- before this fix. Repoints affected events to the lower-id (canonical)
-- venue, then deletes the duplicate row. Safe to call repeatedly.
create or replace function merge_duplicate_venues()
returns integer
language plpgsql
as $$
declare
  merged_count integer := 0;
  rec record;
begin
  for rec in
    select v1.id as dup_id, v2.id as canonical_id
    from venues v1
    join venues v2
      on v1.id > v2.id
      and (
        (v1.postcode is not null and v1.postcode = v2.postcode)
        or (
          v1.lat is not null and v1.lng is not null
          and v2.lat is not null and v2.lng is not null
          and abs(v1.lat - v2.lat) < 0.003 and abs(v1.lng - v2.lng) < 0.003
        )
      )
      and similarity(normalize_venue_text(v1.name), normalize_venue_text(v2.name)) > 0.4
  loop
    update events set venue_id = rec.canonical_id where venue_id = rec.dup_id;
    delete from venues where id = rec.dup_id;
    merged_count := merged_count + 1;
  end loop;

  return merged_count;
end;
$$;
