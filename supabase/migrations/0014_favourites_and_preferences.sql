-- Phase 5: favourites, notification preferences, and home location/radius
-- (docs/PROJECT_PLAN.md Phase 5). Built on the real end-user Supabase Auth
-- accounts already wired up in Sidebar.tsx (email/password + Google OAuth).
--
-- All four surfaces below get direct RLS (own-row only) rather than a
-- security-definer RPC, unlike organisers/organiser_claims in
-- 0009_organiser_claims.sql — none of these tables are publicly readable,
-- so a plain auth.uid() = user_id policy can't leak another user's row the
-- way a broad UPDATE policy on a public-read table could.

-- ---------------------------------------------------------------------------
-- profiles: extend with home location + travel radius. Never got an insert
-- policy in 0001_init.sql (Phase 0 only ever wrote it via service-role) —
-- now that real accounts exist, the Settings panel upserts its own row
-- straight from the browser client, so it needs read/insert/update policies.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists home_label text, -- what the user typed/selected, for display
  add column if not exists travel_radius_km numeric;

create policy "Users can read their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- event_favourites
-- ---------------------------------------------------------------------------
create table if not exists event_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table event_favourites enable row level security;

create policy "Users can read their own event favourites" on event_favourites
  for select using (auth.uid() = user_id);

create policy "Users can insert their own event favourites" on event_favourites
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own event favourites" on event_favourites
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- venue_favourites
-- ---------------------------------------------------------------------------
create table if not exists venue_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid not null references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

alter table venue_favourites enable row level security;

create policy "Users can read their own venue favourites" on venue_favourites
  for select using (auth.uid() = user_id);

create policy "Users can insert their own venue favourites" on venue_favourites
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own venue favourites" on venue_favourites
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- profile_notification_buckets: which identity/accessibility flags (see the
-- `buckets` seed in 0001_init.sql/0005_new_buckets.sql) a user wants to be
-- notified about, e.g. "free-entry", "queer". Reuses the existing bucket
-- vocabulary instead of a bespoke enum, so a new bucket added to
-- lib/buckets.ts is automatically selectable here with no migration.
-- Preference storage only — matching/delivery (push/email) is a separate
-- follow-up, not scoped here.
-- ---------------------------------------------------------------------------
create table if not exists profile_notification_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references buckets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bucket_id)
);

alter table profile_notification_buckets enable row level security;

create policy "Users can read their own notification prefs" on profile_notification_buckets
  for select using (auth.uid() = user_id);

create policy "Users can insert their own notification prefs" on profile_notification_buckets
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own notification prefs" on profile_notification_buckets
  for delete using (auth.uid() = user_id);
