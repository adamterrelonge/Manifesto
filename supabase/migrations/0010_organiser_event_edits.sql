-- Phase 4: per-event editing for claimed organisers, extending the
-- organiser claim/edit flow from 0009_organiser_claims.sql. Same
-- security-definer RPC shape as claim_organiser_update — each function
-- checks ownership (organiser.claimed_by = auth.uid()) server-side rather
-- than granting a broad RLS UPDATE policy on `events`, which stays public-
-- read-published-only otherwise.

create or replace function claim_organiser_update_event(
  p_event_id uuid,
  p_title text,
  p_description text -- null = leave unchanged; '' = clear to null; else set
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
      end
  where id = p_event_id
    and organiser_id in (select id from organisers where claimed_by = auth.uid());
end;
$$;

grant execute on function claim_organiser_update_event(uuid, text, text) to authenticated;

-- Soft-remove: flips a published event to 'flagged' rather than deleting
-- it, so a moderator can review/reverse it via the existing admin tooling.
-- Only applies to currently-published events of the caller's own claimed
-- organiser — cannot be used to un-hide, re-flag an already-flagged event,
-- or touch anyone else's listing.
create or replace function claim_organiser_hide_event(
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events
  set status = 'flagged'
  where id = p_event_id
    and status = 'published'
    and organiser_id in (select id from organisers where claimed_by = auth.uid());
end;
$$;

grant execute on function claim_organiser_hide_event(uuid) to authenticated;
