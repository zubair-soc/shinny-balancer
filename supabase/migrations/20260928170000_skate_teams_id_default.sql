-- skate_teams.id was created without its sequence default in the staging schema,
-- so inserts from the balancer fail even though skate_id has a unique constraint.
begin;

create sequence if not exists public.skate_teams_id_seq;
alter sequence public.skate_teams_id_seq owned by public.skate_teams.id;
alter table public.skate_teams
  alter column id set default nextval('public.skate_teams_id_seq'::regclass);

select setval(
  'public.skate_teams_id_seq'::regclass,
  coalesce((select max(id) + 1 from public.skate_teams), 1),
  false
);

grant usage, select on sequence public.skate_teams_id_seq to authenticated;

commit;
