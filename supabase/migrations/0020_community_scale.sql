-- Phase 2 of docs/INGESTION_EXPANSION_PLAN.md: widen the public gate to
-- community-scale culture, and keep mass-market events out.
--
-- 1. venues.capacity — optional, hand-entered where known. lib/scale.ts
--    treats capacity >= 300 as a large-scale venue.
-- 2. events.scale / events.scale_reasons — written by runScale
--    (lib/pipeline.ts) from lib/scale.ts. 'large' events are never shown
--    (lib/public-gate.ts); 'unknown' is treated as community-scale.
-- 3. The 'community-culture' bucket ("Culture & Lates") — gate-qualifying:
--    Lates, artist talks, community screenings and events from curated
--    community-anchored sources (lib/community-culture.ts).
--
-- Must be applied BEFORE deploying the code that selects events.scale
-- (lib/events-query.ts) — otherwise the public event query errors.

alter table venues add column if not exists capacity integer
  check (capacity is null or capacity > 0);

alter table events add column if not exists scale text
  check (scale is null or scale in ('community', 'large', 'unknown'));
alter table events add column if not exists scale_reasons text[];

insert into buckets (slug, label) values
  ('community-culture', 'Culture & Lates')
on conflict (slug) do nothing;
