-- Adds two new event_buckets.assigned_by values:
--
-- 'source-mission' — lib/source-missions.ts: a bucket inherited from the
--   stated mission of the curated organiser/venue that published the event
--   (e.g. every London LGBTQ+ Community Centre event -> queer), rather than
--   matched from the event's own copy. Confidence 0.85-0.9: public via the
--   >= 0.8 gate, but still listed in /admin/review so a moderator can reject
--   it for any one event the mission doesn't fit.
--
-- 'embedding' — scripts/semantic-classify.ts: a local sentence-embedding
--   nearest-neighbour suggestion. Always written below the 0.8 public gate,
--   so it only ever surfaces in the review queue; a moderator approval
--   flips it to 'moderator' like any other row.
--
-- Must be applied BEFORE deploying the lib/pipeline.ts change that writes
-- 'source-mission', or every ingest's classification upserts will fail the
-- check constraint.

alter table event_buckets drop constraint if exists event_buckets_assigned_by_check;
alter table event_buckets add constraint event_buckets_assigned_by_check
  check (assigned_by in (
    'ai', 'keyword', 'organiser', 'moderator', 'rejected',
    'venue-accessibility', 'source-mission', 'embedding'
  ));
