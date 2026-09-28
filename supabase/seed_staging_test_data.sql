-- Fake-only seed data for the Skate Manager staging project.
-- Safe to run more than once: creates clearly labeled TEST DATA players/skates,
-- avoids duplicate roster entries/credits, and refreshes the test skate dates.
-- Does not read, copy, or modify production records.

begin;

-- The SQL Editor runs as a database administrator. Set a transaction-local Admin
-- claim so the staging-only player guard accepts these test ratings. This resets
-- automatically at COMMIT and does not change anyone's Supabase account role.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

insert into public.players (name, rating, rating_v2, rating_v2b)
values
  ('TEST PLAYER 01 - Alex One', 8, 42, 40),
  ('TEST PLAYER 02 - Bailey Two', 11, 58, 56),
  ('TEST PLAYER 03 - Casey Three', 14, 71, 69),
  ('TEST PLAYER 04 - Devon Four', 6, 35, 38),
  ('TEST PLAYER 05 - Ellis Five', 10, 53, 51),
  ('TEST PLAYER 06 - Frankie Six', 16, 82, 79),
  ('TEST PLAYER 07 - Gray Seven', 9, 47, 45),
  ('TEST PLAYER 08 - Harper Eight', 12, 64, 62),
  ('TEST PLAYER 09 - Indigo Nine', 5, 29, 31),
  ('TEST PLAYER 10 - Jordan Ten', 13, 68, 66),
  ('TEST PLAYER 11 - Kai Eleven', 7, 39, 41),
  ('TEST PLAYER 12 - Logan Twelve', 15, 77, 74),
  ('TEST PLAYER 13 - Morgan Thirteen', 9, 49, 48),
  ('TEST PLAYER 14 - Nico Fourteen', 12, 62, 60),
  ('TEST PLAYER 15 - Oak Fifteen', 4, 25, 28),
  ('TEST PLAYER 16 - Parker Sixteen', 17, 88, 85),
  ('TEST PLAYER 17 - Quinn Seventeen', 8, 43, 44),
  ('TEST PLAYER 18 - Riley Eighteen', 11, 57, 55)
on conflict (name) do nothing;

-- Keep the test skates on useful relative dates if this script is rerun later.
update public.skates set
  date = current_date + 2, time_start = '19:30', time_end = '21:00',
  cost = '$25', capacity = 12, location = 'NAIT', tier = 'T3',
  event_type = 'Scrimmage', is_archived = false
where title = 'TEST DATA - T3 Balance Practice';
update public.skates set
  date = current_date + 4, time_start = '20:00', time_end = '21:30',
  cost = '$25', capacity = 6, location = 'Millwoods', tier = 'T2',
  event_type = 'Scrimmage', is_archived = false
where title = 'TEST DATA - T2 Full and Waitlist';
update public.skates set
  date = current_date + 6, time_start = '19:00', time_end = '20:30',
  cost = '$25', capacity = 12, location = 'NAIT', tier = 'BLAST',
  event_type = 'BLAST', is_archived = false
where title = 'TEST DATA - BLAST Credit Practice';
update public.skates set
  date = current_date - 5, time_start = '18:30', time_end = '20:00',
  cost = '$25', capacity = 12, location = 'NAIT', tier = 'T3',
  event_type = 'Scrimmage', is_archived = true
where title = 'TEST DATA - Past Archived Skate';

insert into public.skates (title, date, time_start, time_end, cost, location, capacity, tier, event_type, is_archived)
select seed.title, seed.date, seed.time_start, seed.time_end, '$25', seed.location, seed.capacity, seed.tier, seed.event_type, seed.is_archived
from (values
  ('TEST DATA - T3 Balance Practice', current_date + 2, time '19:30', time '21:00', 'NAIT', 12, 'T3', 'Scrimmage', false),
  ('TEST DATA - T2 Full and Waitlist', current_date + 4, time '20:00', time '21:30', 'Millwoods', 6, 'T2', 'Scrimmage', false),
  ('TEST DATA - BLAST Credit Practice', current_date + 6, time '19:00', time '20:30', 'NAIT', 12, 'BLAST', 'BLAST', false),
  ('TEST DATA - Past Archived Skate', current_date - 5, time '18:30', time '20:00', 'NAIT', 12, 'T3', 'Scrimmage', true)
) as seed(title, date, time_start, time_end, location, capacity, tier, event_type, is_archived)
where not exists (
  select 1 from public.skates s where s.title = seed.title
);

with roster_seed(skate_title, player_name, is_goalie, is_paid, is_waitlist, position, friend_group) as (
  values
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 01 - Alex One', false, true, false, 1, 'A'),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 02 - Bailey Two', false, true, false, 2, 'A'),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 03 - Casey Three', false, false, false, 3, null),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 04 - Devon Four', false, true, false, 4, 'B'),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 05 - Ellis Five', false, true, false, 5, 'B'),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 06 - Frankie Six', false, true, false, 6, null),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 07 - Gray Seven', false, true, false, 7, null),
    ('TEST DATA - T3 Balance Practice', 'TEST PLAYER 08 - Harper Eight', true, true, false, 8, null),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 09 - Indigo Nine', false, true, false, 1, null),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 10 - Jordan Ten', false, false, false, 2, null),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 11 - Kai Eleven', false, true, false, 3, 'C'),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 12 - Logan Twelve', false, true, false, 4, 'C'),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 13 - Morgan Thirteen', false, true, false, 5, null),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 14 - Nico Fourteen', false, true, false, 6, null),
    ('TEST DATA - T2 Full and Waitlist', 'TEST PLAYER 15 - Oak Fifteen', false, false, true, 7, null),
    ('TEST DATA - BLAST Credit Practice', 'TEST PLAYER 16 - Parker Sixteen', false, true, false, 1, null),
    ('TEST DATA - BLAST Credit Practice', 'TEST PLAYER 17 - Quinn Seventeen', false, true, false, 2, null)
)
insert into public.skate_registrations (skate_id, player_id, player_name, is_goalie, is_paid, is_waitlist, position, friend_group)
select s.id, p.id::integer, roster_seed.player_name, roster_seed.is_goalie, roster_seed.is_paid,
       roster_seed.is_waitlist, roster_seed.position, roster_seed.friend_group
from roster_seed
join public.skates s on s.title = roster_seed.skate_title
join public.players p on p.name = roster_seed.player_name
where not exists (
  select 1 from public.skate_registrations r
  where r.skate_id = s.id and lower(r.player_name) = lower(roster_seed.player_name)
);

-- Test Player 01 has enough credit to cover a skate. Test Player 02 can apply
-- partial credit; Test Player 03 has no credit. No real credit entries are used.
insert into public.player_credits (player_id, amount, reason, status, created_by)
select p.id::integer, seed.amount, seed.reason, 'active', 'STAGING TEST DATA'
from (values
  ('TEST PLAYER 01 - Alex One', 25::numeric, 'TEST DATA - Full skate credit'),
  ('TEST PLAYER 02 - Bailey Two', 10::numeric, 'TEST DATA - Partial skate credit')
) as seed(player_name, amount, reason)
join public.players p on p.name = seed.player_name
where not exists (
  select 1 from public.player_credits c
  where c.player_id = p.id::integer and c.reason = seed.reason
);

commit;

-- Verify after running:
-- select count(*) from public.players where name like 'TEST PLAYER %';
-- select title, date, is_archived from public.skates where title like 'TEST DATA - %' order by date;
-- select p.name, sum(c.amount) from public.player_credits c join public.players p on p.id = c.player_id where c.reason like 'TEST DATA - %' and c.status = 'active' group by p.name;
