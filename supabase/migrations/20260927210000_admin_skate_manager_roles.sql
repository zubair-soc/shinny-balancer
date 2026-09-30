-- Role split for the staging Skate Manager app.
-- Admins retain full access. Skate Managers can manage rosters, balance teams,
-- and edit player ratings, while skate/financial administration stays admin-only.
begin;

create or replace function public.is_skate_admin()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') @> '["admin"]'::jsonb, false);
$$;

create or replace function public.is_skate_manager()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'skate_manager', false)
    or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') @> '["skate_manager"]'::jsonb, false);
$$;

revoke all on function public.is_skate_admin() from public;
revoke all on function public.is_skate_manager() from public;
grant execute on function public.is_skate_admin() to authenticated;
grant execute on function public.is_skate_manager() to authenticated;

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Replace the temporary all-authenticated staging policies with role checks.
do $policies$
declare
  target record;
  existing_policy record;
begin
  for target in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', target.tablename);
    for existing_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target.tablename
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target.tablename);
    end loop;
    execute format(
      'create policy admin_full_access on public.%I for all to authenticated using (public.is_skate_admin()) with check (public.is_skate_admin())',
      target.tablename
    );
  end loop;
end
$policies$;

-- Skate Managers can view skate details through a sanitized view, but cannot
-- query or change the financial columns in the underlying skates table.
create or replace view public.skate_manager_skates
with (security_barrier = true)
as
select
  s.id, s.title, s.date, s.time_start, s.time_end,
  case when public.is_skate_admin() then s.cost else null end as cost, s.location,
  s.capacity, s.tier, s.created_at, s.updated_at, s.skate_number,
  s.event_type, s.confidence, s.is_archived
from public.skates s
where public.is_skate_admin() or public.is_skate_manager();

grant select on public.skate_manager_skates to authenticated;

-- Player data exposed to Skate Managers excludes contact and demographic fields.
create or replace view public.skate_manager_players
with (security_barrier = true)
as
select
  p.id, p.name, p.rating, p.rating_v2, p.rating_v2b, p.rating_v2_anchored,
  p.is_pillar, p.lower_pillar_id, p.upper_pillar_id
from public.players p
where public.is_skate_admin() or public.is_skate_manager();

grant select on public.skate_manager_players to authenticated;

-- Roster management and team building.
do $manager_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'skate_registrations', 'skate_teams', 'team_assignments',
    'player_team_assignments', 'teams', 'skate_votes', 'rating_nudges',
    'player_skills', 'player_skills_simple', 'v2b_ratings'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'create policy skate_manager_access on public.%I for all to authenticated using (public.is_skate_manager()) with check (public.is_skate_manager())',
        table_name
      );
    end if;
  end loop;
end
$manager_policies$;

-- Managers may add a player from roster management and update ratings only.
create policy skate_manager_add_players on public.players
  for insert to authenticated with check (public.is_skate_manager());
create policy skate_manager_update_players on public.players
  for update to authenticated using (public.is_skate_manager())
  with check (public.is_skate_manager());

create or replace function public.limit_skate_manager_player_edits()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_skate_admin() then return new; end if;
  if not public.is_skate_manager() then
    raise exception 'An assigned Skate Manager or Admin role is required.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and row(
    new.id, new.name, new.created_at, new.email, new.position, new.archived,
    new.gender, new.age_group, new.indigeneity, new.new_canadian,
    new.join_date, new.first_scrimmage_date, new.last_scrimmage_date,
    new.class_id
  ) is distinct from row(
    old.id, old.name, old.created_at, old.email, old.position, old.archived,
    old.gender, old.age_group, old.indigeneity, old.new_canadian,
    old.join_date, old.first_scrimmage_date, old.last_scrimmage_date,
    old.class_id
  ) then
    raise exception 'Skate Managers may edit player ratings, but not player identity or profile details.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and (
    new.email is not null or new.position is not null or new.gender is not null
    or new.age_group is not null or new.indigeneity is not null
    or new.join_date is not null or new.first_scrimmage_date is not null
    or new.last_scrimmage_date is not null or new.is_pillar
    or new.rating_v2 is not null or new.rating_v2b is not null
    or new.lower_pillar_id is not null or new.upper_pillar_id is not null
    or new.class_id is not null
  ) then
    raise exception 'Skate Managers may add a player name from roster management only.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_skate_manager_player_edits on public.players;
create trigger limit_skate_manager_player_edits
before insert or update on public.players
for each row execute function public.limit_skate_manager_player_edits();

-- The manager credit screen uses only these narrow RPCs; it cannot read or edit
-- the full credits ledger or its admin totals.
create or replace function public.get_skate_manager_credit_balances()
returns table (player_id bigint, available_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An assigned Skate Manager or Admin role is required.' using errcode = '42501';
  end if;
  return query
    select p.id::bigint, coalesce(sum(c.amount), 0)::numeric
    from public.players p
    left join public.player_credits c on c.player_id = p.id and c.status = 'active'
    group by p.id;
end;
$$;

create or replace function public.apply_player_credit_to_skate(p_player_id bigint, p_skate_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_name text;
  v_skate public.skates%rowtype;
  v_cost numeric;
  v_available numeric;
  v_remaining numeric;
  v_applied numeric;
  v_credit public.player_credits%rowtype;
  v_use numeric;
  v_position integer;
  v_is_paid boolean;
  v_roster_count integer;
  v_now timestamptz := now();
begin
  if not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An assigned Skate Manager or Admin role is required.' using errcode = '42501';
  end if;

  select p.name into v_player_name from public.players p where p.id = p_player_id;
  if v_player_name is null then raise exception 'Player not found.'; end if;

  select * into v_skate from public.skates s where s.id = p_skate_id for update;
  if not found then raise exception 'Skate not found.'; end if;
  if v_skate.date < (v_now at time zone 'America/Edmonton')::date or coalesce(v_skate.is_archived, false) then
    raise exception 'Choose an upcoming skate.';
  end if;

  v_cost := nullif(regexp_replace(v_skate.cost, '[^0-9.]', '', 'g'), '')::numeric;
  if v_cost is null or v_cost <= 0 then raise exception 'This skate does not have a payable price.'; end if;

  if exists (
    select 1 from public.skate_registrations r
    where r.skate_id = p_skate_id and r.is_waitlist = false
      and (r.player_id = p_player_id or lower(r.player_name) = lower(v_player_name))
  ) then raise exception 'This player is already on that skate.'; end if;

  select count(*) into v_roster_count from public.skate_registrations r
  where r.skate_id = p_skate_id and r.is_waitlist = false and coalesce(r.is_goalie, false) = false;
  if v_roster_count >= v_skate.capacity then raise exception 'That skate is full.'; end if;

  select coalesce(sum(c.amount), 0) into v_available from public.player_credits c
  where c.player_id = p_player_id and c.status = 'active';
  if v_available <= 0 then raise exception 'This player has no available credit.'; end if;

  v_applied := least(v_cost, v_available);
  v_remaining := v_applied;
  for v_credit in
    select * from public.player_credits c
    where c.player_id = p_player_id and c.status = 'active' and c.amount > 0
    order by c.created_at, c.id for update
  loop
    exit when v_remaining <= 0;
    v_use := least(v_credit.amount, v_remaining);
    if v_use = v_credit.amount then
      update public.player_credits set status = 'used', used_on_skate_id = p_skate_id,
        used_at = v_now, used_by = 'Skate Manager', last_activity_at = v_now
      where id = v_credit.id;
    else
      update public.player_credits set amount = amount - v_use, last_activity_at = v_now
      where id = v_credit.id;
      insert into public.player_credits (
        player_id, amount, reason, source_skate_id, status, created_by,
        created_at, used_on_skate_id, used_at, used_by, last_activity_at
      ) values (
        v_credit.player_id, v_use, v_credit.reason || ' (partial)', v_credit.source_skate_id,
        'used', v_credit.created_by, v_credit.created_at, p_skate_id, v_now,
        'Skate Manager', v_now
      );
    end if;
    v_remaining := v_remaining - v_use;
  end loop;

  v_is_paid := v_applied >= v_cost;
  select coalesce(max(r.position), 0) + 1 into v_position
  from public.skate_registrations r where r.skate_id = p_skate_id;
  insert into public.skate_registrations (
    skate_id, player_id, player_name, is_goalie, is_paid, is_waitlist, position
  ) values (p_skate_id, p_player_id, v_player_name, false, v_is_paid, false, v_position);

  return jsonb_build_object(
    'player_name', v_player_name,
    'applied', v_applied,
    'remaining_to_pay', greatest(v_cost - v_applied, 0),
    'is_paid', v_is_paid
  );
end;
$$;

revoke all on function public.get_skate_manager_credit_balances() from public;
revoke all on function public.apply_player_credit_to_skate(bigint, bigint) from public;
grant execute on function public.get_skate_manager_credit_balances() to authenticated;
grant execute on function public.apply_player_credit_to_skate(bigint, bigint) to authenticated;

-- A manager can see the current parking code for roster posts, but cannot change it.
create policy app_settings_manager_read on public.app_settings
  for select to authenticated using (public.is_skate_manager());

commit;
