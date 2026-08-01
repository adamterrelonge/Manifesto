-- Phase 3: index on end_at, plus a retention/expiry pass for events whose
-- run has ended. Run this in the Supabase SQL editor after 0006_quality_score.sql.

create index if not exists events_end_at_idx on events (end_at);

-- Moves published events whose run has fully ended out of the live set by
-- flipping them to the 'expired' status already defined in the events
-- table's check constraint (see 0001_init.sql) but never actually used
-- until now. Every existing query that filters `status = 'published'`
-- (the homepage, classify, quality, dedup) automatically stops seeing
-- these rows once expired — no new filter logic needed anywhere else.
--
-- coalesce(end_at, start_at) matches the same fallback already used in
-- lib/date-filter.ts and app/page.tsx: a point-in-time event with no
-- end_at expires based on its single start_at.
create or replace function expire_ended_events()
returns integer
language sql
as $$
  with expired as (
    update events
    set status = 'expired'
    where status = 'published'
      and coalesce(end_at, start_at) < now()
    returning id
  )
  select count(*)::integer from expired;
$$;
