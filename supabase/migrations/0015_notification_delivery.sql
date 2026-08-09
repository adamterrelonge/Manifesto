-- Phase 5: notification delivery (docs/PROJECT_PLAN.md). Preferences and
-- home location/radius already existed (0014_favourites_and_preferences.sql)
-- but nothing read them — this adds the ledger the delivery worker
-- (lib/notifications.ts) uses to avoid double-emailing a user about the same
-- event across runs.
--
-- Unlike event_favourites/venue_favourites/profile_notification_buckets,
-- this table is never read or written from the browser client — only the
-- service-role admin client (app/api/notify, chained from app/api/ingest)
-- touches it. RLS is enabled with no policies attached, the same
-- default-deny-to-anon-and-authenticated posture as any table that simply
-- never got a "Public read ..." policy in 0001_init.sql; service role
-- bypasses RLS entirely, so this is belt-and-suspenders, not the real
-- access control.
create table if not exists event_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  bucket_id uuid references buckets(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table event_notifications enable row level security;

create index if not exists event_notifications_user_id_idx on event_notifications(user_id);
