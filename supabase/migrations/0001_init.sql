-- Phase 0 foundations: venues, organisers, events, buckets, event_buckets, profiles.
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query),
-- or via `supabase db push` if you adopt the Supabase CLI later.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  region text, -- borough / district / unitary authority depending on locale
  postcode text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- organisers
-- ---------------------------------------------------------------------------
create table if not exists organisers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text, -- e.g. 'ticketmaster', 'skiddle', 'bio-link', 'manual'
  profile_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- buckets: controlled vocabulary for identity/accessibility tags (see §9)
-- ---------------------------------------------------------------------------
create table if not exists buckets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into buckets (slug, label) values
  ('black', 'Black'),
  ('poc', 'POC'),
  ('queer', 'Queer'),
  ('latinx', 'Latinx'),
  ('disability-friendly', 'Disability-friendly'),
  ('autistic-friendly', 'Autistic-friendly'),
  ('womxn-led', 'Womxn-led'),
  ('free-entry', 'Free entry')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  venue_id uuid references venues(id),
  organiser_id uuid references organisers(id),
  category text, -- music, gallery, film, food, workshop, market, ...
  is_free boolean not null default false,
  price_min numeric,
  price_max numeric,
  currency text not null default 'GBP',
  image_url text,
  source_provider text not null, -- 'ticketmaster', 'skiddle', 'ticketsource', 'meetup', 'bio-link', 'manual'
  source_id text not null,       -- id as given by the source, for idempotent upserts
  source_url text,
  scraped_at timestamptz not null default now(),
  status text not null default 'published'
    check (status in ('draft', 'published', 'flagged', 'expired')),
  dedup_group_id uuid, -- links duplicate listings of the same event across sources
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, source_id)
);

create index if not exists events_start_at_idx on events (start_at);
create index if not exists events_venue_id_idx on events (venue_id);
create index if not exists events_status_idx on events (status);

-- ---------------------------------------------------------------------------
-- event_buckets: AI/organiser/moderator-assigned bucket tags per event
-- ---------------------------------------------------------------------------
create table if not exists event_buckets (
  event_id uuid not null references events(id) on delete cascade,
  bucket_id uuid not null references buckets(id) on delete cascade,
  confidence numeric, -- 0..1, set by the AI enrichment layer (Phase 2)
  evidence text,       -- snippet the model used to justify the tag
  assigned_by text not null default 'ai'
    check (assigned_by in ('ai', 'organiser', 'moderator')),
  created_at timestamptz not null default now(),
  primary key (event_id, bucket_id)
);

-- ---------------------------------------------------------------------------
-- profiles: minimal scaffold now, extended in Phase 4 (location, favourites,
-- ratings, notification preferences) alongside Supabase Auth accounts.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: public (anon) can read published data only.
-- All writes in Phase 0 go through the service-role key (ingestion route
-- handler), which bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table venues enable row level security;
alter table organisers enable row level security;
alter table buckets enable row level security;
alter table events enable row level security;
alter table event_buckets enable row level security;
alter table profiles enable row level security;

create policy "Public read venues" on venues
  for select using (true);

create policy "Public read organisers" on organisers
  for select using (true);

create policy "Public read buckets" on buckets
  for select using (true);

create policy "Public read published events" on events
  for select using (status = 'published');

create policy "Public read event_buckets for published events" on event_buckets
  for select using (
    exists (
      select 1 from events
      where events.id = event_buckets.event_id
        and events.status = 'published'
    )
  );

-- No public policy on profiles: users will read/write only their own row via
-- Supabase Auth once accounts land in Phase 4.
