-- Persist moderator rejections in the bucket review queue instead of
-- deleting the row, so a re-ingest's classification pass (which
-- re-evaluates every event's keyword matches on every run) has a durable
-- record that a human already said no. Paired with the change in
-- runClassification (lib/pipeline.ts), which now skips any (event_id,
-- bucket_id) pair already marked 'moderator' or 'rejected' instead of
-- upserting a fresh 'keyword' row over it — that upsert was the bug: it
-- reset approved tags back to 'keyword' (undoing the approval) and, since
-- rejects used to delete the row outright, resurrected rejected tags too.
alter table event_buckets drop constraint if exists event_buckets_assigned_by_check;
alter table event_buckets add constraint event_buckets_assigned_by_check
  check (assigned_by in ('ai', 'keyword', 'organiser', 'moderator', 'rejected'));
