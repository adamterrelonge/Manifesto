-- Adds 'venue-accessibility' as a valid event_buckets.assigned_by value —
-- see lib/venue-accessibility.ts. Distinct from 'keyword' (matched off the
-- event's own title/description text) because these tags come from the
-- venue's own published accessibility statement instead, applied to every
-- event held there regardless of what that event's own copy says.

alter table event_buckets drop constraint if exists event_buckets_assigned_by_check;
alter table event_buckets add constraint event_buckets_assigned_by_check
  check (assigned_by in ('ai', 'keyword', 'organiser', 'moderator', 'rejected', 'venue-accessibility'));
