-- Phase 6 "ideas to take it further" Tier 1 (docs/PROJECT_PLAN.md §13):
-- report/flag pipeline for mistagging + a lightweight community
-- moderation/trust network built on top of it.

-- ---------------------------------------------------------------------------
-- Trust flag: granted manually (see app/api/admin/moderators/route.ts,
-- ADMIN_SECRET-gated) rather than any self-service application flow — the
-- whole point of a trust network is that trust is vetted, not automatic. A
-- boolean on profiles rather than a separate table since profiles is
-- already the 1:1 extension of auth.users (0014_favourites_and_preferences.sql).
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists is_trusted_moderator boolean not null default false;

-- ---------------------------------------------------------------------------
-- event_bucket_flags: a signed-in user's report that a specific bucket tag
-- on a specific event is wrong. Multiple users can flag the same
-- (event_id, bucket_id) pair — moderator_resolve_bucket_flag below resolves
-- them all at once, since the moderation decision is about the tag, not any
-- one individual report.
-- ---------------------------------------------------------------------------
create table if not exists event_bucket_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  bucket_id uuid not null references buckets(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, bucket_id, reporter_id)
);

alter table event_bucket_flags enable row level security;

create policy "Users can insert their own bucket flags" on event_bucket_flags
  for insert with check (auth.uid() = reporter_id);

-- Lets a user's own client know "you already flagged this". Trusted
-- moderators read every user's flags through list_open_bucket_flags()
-- below instead, which is security-definer and bypasses this policy
-- entirely rather than needing a broader (and riskier) SELECT policy here.
create policy "Users can read their own bucket flags" on event_bucket_flags
  for select using (auth.uid() = reporter_id);

create index if not exists event_bucket_flags_open_idx
  on event_bucket_flags (event_id, bucket_id)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- list_open_bucket_flags: the moderation queue for trusted community
-- members (app/moderate). Security-definer so it can read every user's
-- flags despite the owner-only RLS policy above — gated internally on
-- is_trusted_moderator, same security-definer-plus-server-side-check
-- pattern as claim_organiser_update/merge_duplicate_venues elsewhere in
-- this schema.
-- ---------------------------------------------------------------------------
create or replace function list_open_bucket_flags()
returns table (
  event_id uuid,
  bucket_id uuid,
  event_title text,
  bucket_label text,
  bucket_slug text,
  flag_count bigint,
  latest_reason text,
  first_flagged_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and is_trusted_moderator = true
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    f.event_id,
    f.bucket_id,
    e.title,
    b.label,
    b.slug,
    count(*)::bigint as flag_count,
    (array_agg(f.reason order by f.created_at desc) filter (where f.reason is not null))[1] as latest_reason,
    min(f.created_at) as first_flagged_at
  from event_bucket_flags f
  join events e on e.id = f.event_id
  join buckets b on b.id = f.bucket_id
  where f.status = 'open'
  group by f.event_id, f.bucket_id, e.title, b.label, b.slug
  order by count(*) desc, min(f.created_at) asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- moderator_resolve_bucket_flag: a trusted member's decision on a flagged
-- tag. 'upheld' reuses the exact 'rejected' assigned_by state
-- 0012_bucket_rejected_state.sql already gave event_buckets for admin
-- rejections — runClassification (lib/pipeline.ts) already treats
-- 'rejected' as a permanent, re-ingest-proof lock, so a community-upheld
-- flag gets that guarantee for free, no pipeline changes needed.
-- 'dismissed' just closes the flags and leaves the tag alone.
-- ---------------------------------------------------------------------------
create or replace function moderator_resolve_bucket_flag(
  p_event_id uuid,
  p_bucket_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('upheld', 'dismissed') then
    raise exception 'invalid status: %', p_status;
  end if;

  if not exists (
    select 1 from profiles where id = auth.uid() and is_trusted_moderator = true
  ) then
    raise exception 'not authorized';
  end if;

  update event_bucket_flags
  set status = p_status, resolved_by = auth.uid(), resolved_at = now()
  where event_id = p_event_id and bucket_id = p_bucket_id and status = 'open';

  if p_status = 'upheld' then
    update event_buckets
    set assigned_by = 'rejected'
    where event_id = p_event_id and bucket_id = p_bucket_id;
  end if;
end;
$$;
