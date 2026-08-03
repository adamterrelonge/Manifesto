-- Phase 3: missing indexes flagged in docs/PROJECT_PLAN.md §11.
--
-- end_at: scanned by expire_ended_events() when marking past events expired.
-- The composite covers the homepage query's three-way filter
-- (status = 'published' AND is_duplicate = false AND start_at >= now())
-- so Postgres can satisfy the whole WHERE clause from one index scan
-- instead of three separate bitmap scans merged at runtime.

create index if not exists events_end_at_idx
  on events (end_at);

create index if not exists events_status_is_duplicate_start_at_idx
  on events (status, is_duplicate, start_at);
