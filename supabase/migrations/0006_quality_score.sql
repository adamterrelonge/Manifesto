-- Spam/quality filter: adds a score events must clear to be shown publicly.
-- Written by POST /api/quality (lib/quality.ts). NULL = not yet scored,
-- which is deliberately treated as "not shown" by app/page.tsx (same
-- pattern as unclassified events needing /api/classify first).
--
-- Run this in the Supabase SQL editor after 0001-0005.

alter table events add column if not exists quality_score numeric;
alter table events add column if not exists quality_flags text[];
create index if not exists events_quality_score_idx on events (quality_score);
