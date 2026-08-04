-- Phase 4: organiser claim/edit flow (docs/PROJECT_PLAN.md Phase 4 / §7).
-- Built on the Supabase Auth accounts already wired up in Sidebar.tsx
-- (Google OAuth + email/password), not a bespoke token scheme — claiming
-- an organiser links it to a real auth.users id, and editing goes through
-- a security-definer RPC (same shape as find_matching_venue /
-- merge_duplicate_venues) rather than a broad RLS UPDATE policy on a
-- publicly-readable table.

alter table organisers
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create table if not exists organiser_claims (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references organisers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_email text not null, -- denormalised from the session at submit time, for admin display
  message text not null,     -- claimant's self-reported evidence; admin judgement is the actual check
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists organiser_claims_organiser_id_idx on organiser_claims (organiser_id);
create index if not exists organiser_claims_status_idx on organiser_claims (status);

-- One live pending claim per (organiser, user) — stops accidental double
-- submits without blocking a re-claim after a rejection.
create unique index if not exists organiser_claims_pending_unique
  on organiser_claims (organiser_id, user_id)
  where status = 'pending';

alter table organiser_claims enable row level security;

-- Signed-in users can submit and read only their own claims — no update/
-- delete policy, so status transitions only happen via the service-role
-- admin route (app/api/admin/claims/route.ts), same pattern as submissions.
create policy "Users can read their own claims" on organiser_claims
  for select using (auth.uid() = user_id);

create policy "Users can insert their own claims" on organiser_claims
  for insert with check (auth.uid() = user_id);

-- Self-edit for a claimed organiser's own record, scoped to just name/
-- profile_url (never claimed_by/claimed_at/source_type) and gated on
-- claimed_by matching the caller — avoids a broad RLS UPDATE policy on a
-- table that's otherwise public-read.
create or replace function claim_organiser_update(
  p_organiser_id uuid,
  p_name text,
  p_profile_url text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update organisers
  set name = coalesce(nullif(trim(p_name), ''), name),
      profile_url = coalesce(nullif(trim(p_profile_url), ''), profile_url)
  where id = p_organiser_id
    and claimed_by = auth.uid();
end;
$$;

grant execute on function claim_organiser_update(uuid, text, text) to authenticated;
