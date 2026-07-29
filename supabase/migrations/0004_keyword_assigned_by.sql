-- Allows the free, from-scratch keyword classifier (lib/buckets.ts) to
-- honestly label its own tags as 'keyword' rather than overloading 'ai',
-- keeping the door open to add a real LLM-based pass later as a distinct,
-- separately-labeled method.
--
-- Run this in the Supabase SQL editor after 0001-0003.

alter table event_buckets drop constraint if exists event_buckets_assigned_by_check;
alter table event_buckets add constraint event_buckets_assigned_by_check
  check (assigned_by in ('ai', 'keyword', 'organiser', 'moderator'));
