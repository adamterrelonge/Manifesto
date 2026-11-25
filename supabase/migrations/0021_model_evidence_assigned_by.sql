-- Adds 'model-evidence' as a valid event_buckets.assigned_by value
-- (docs/INGESTION_EXPANSION_PLAN.md Phase 3, docs/MODEL_EVAL.md).
--
-- Written by scripts/model-classify.ts: a local zero-shot model tag backed
-- by a verbatim passage from the event's own text (stored in `evidence`),
-- for buckets whose measured precision passed the 95% bar. Confidence is
-- 0.8-0.9: public, and still in /admin/review until a moderator confirms.
--
-- Must be applied BEFORE the CI step `npm run classify:model -- --write`
-- runs, or its upsert fails the check constraint (the step fails; nothing
-- else in the run is affected).

alter table event_buckets drop constraint if exists event_buckets_assigned_by_check;
alter table event_buckets add constraint event_buckets_assigned_by_check
  check (assigned_by in (
    'ai', 'keyword', 'organiser', 'moderator', 'rejected',
    'venue-accessibility', 'source-mission', 'embedding', 'model-evidence'
  ));
