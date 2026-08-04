-- Phase 4: rounds out the organiser self-service surface from 0009/0010 —
-- symmetric unhide, a wider per-event edit RPC (category/price), and the
-- RLS read access an organiser needs to see their own non-published events
-- on app/organiser/manage (previously only status='published' was visible
-- to anyone, including the owning organiser).

-- Safe today because claim_organiser_hide_event (0010) is the ONLY thing
-- in this codebase that ever sets status='flagged' — confirmed by grep.
-- If a moderator-initiated flagging feature is added later, this should be
-- revisited (e.g. a dedicated column) so organisers can't self-unhide
-- something a moderator flagged for cause.
create or replace function claim_organiser_unhide_event(
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events
  set status = 'published'
  where id = p_event_id
    and status = 'flagged'
    and organiser_id in (select id from organisers where claimed_by = auth.uid());
end;
$$;

grant execute on function claim_organiser_unhide_event(uuid) to authenticated;

-- Widen the edit surface beyond title/description. Signature changes, so
-- the old 3-arg version is dropped rather than replaced.
drop function if exists claim_organiser_update_event(uuid, text, text);

create function claim_organiser_update_event(
  p_event_id uuid,
  p_title text,
  p_description text, -- null = leave unchanged; '' = clear to null; else set
  p_category text default null, -- null = leave unchanged; not DB-constrained (see lib/categories.ts for the app-level enum)
  p_is_free boolean default null, -- null = leave unchanged
  p_price_min numeric default null,
  p_price_max numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events
  set title = coalesce(nullif(trim(p_title), ''), title),
      description = case
        when p_description is null then description
        else nullif(trim(p_description), '')
      end,
      category = coalesce(p_category, category),
      is_free = coalesce(p_is_free, is_free),
      -- Switching to free clears any stale price rather than leaving it
      -- alongside is_free = true.
      price_min = case when p_is_free is true then null else coalesce(p_price_min, price_min) end,
      price_max = case when p_is_free is true then null else coalesce(p_price_max, price_max) end
  where id = p_event_id
    and organiser_id in (select id from organisers where claimed_by = auth.uid());
end;
$$;

grant execute on function claim_organiser_update_event(uuid, text, text, text, boolean, numeric, numeric) to authenticated;

-- A claimed organiser can read all of their own events regardless of
-- status (published/flagged/draft/expired) — needed so app/organiser/manage
-- can show hidden events to offer the new unhide action. Only ever exposes
-- an organiser's own rows to themselves, never another organiser's or
-- another user's data.
create policy "Claimed organisers can read their own events" on events
  for select using (
    organiser_id in (select id from organisers where claimed_by = auth.uid())
  );
