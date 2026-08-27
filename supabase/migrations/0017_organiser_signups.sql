-- Self-service "Be an organiser" signup, submitted from app/submit (see
-- app/api/submit/route.ts, mode: "organiser"). Reuses the organisers table
-- rather than a bespoke submissions table, since a self-signup is just an
-- organiser row that hasn't been vetted yet.

-- bio: the organiser's own description of the sort of events they run,
-- shown alongside their profile link on the admin submissions queue and
-- (once approved) their public organiser page.
alter table organisers
  add column if not exists bio text;

-- status: existing rows (scraped via ingestion, or previously self-service
-- claimed) default to 'approved' so this migration doesn't hide anything
-- already public. New public signups are inserted with status = 'pending'
-- by the service-role /api/submit route and only become publicly visible
-- once a moderator approves them via /api/admin/submissions.
alter table organisers
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected'));

drop policy if exists "Public read organisers" on organisers;
create policy "Public read approved organisers" on organisers
  for select using (status = 'approved');
