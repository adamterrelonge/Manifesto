-- Seeds the buckets added to lib/buckets.ts's keyword classifier that
-- weren't in the original 0001_init.sql seed list.
--
-- Run this in the Supabase SQL editor after 0001-0004.

insert into buckets (slug, label) values
  ('east-mon-asian', 'East & Southeast Asian'),
  ('south-asian', 'South Asian'),
  ('deaf-accessible', 'Deaf-accessible'),
  ('sober-friendly', 'Sober-friendly'),
  ('grassroots-activism', 'Grassroots & Activism'),
  ('low-income-access', 'Low-income Access')
on conflict (slug) do nothing;
