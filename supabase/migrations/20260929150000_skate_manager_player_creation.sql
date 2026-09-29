-- Allow Admins and Skate Managers to safely reuse or create a player record
-- without granting direct access to the players table.
create or replace function public.get_or_create_skate_manager_player(p_name text)
returns table (player_id bigint, player_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_player_id bigint;
  v_player_name text;
begin
  if not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An Admin or Skate Manager role is required.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Player name is required.' using errcode = '22023';
  end if;

  select p.id, p.name
    into v_player_id, v_player_name
    from public.players p
   where lower(p.name) = lower(v_name)
   order by p.id
   limit 1;

  if not found then
    insert into public.players (name)
    values (v_name)
    on conflict (name) do nothing
    returning id, name into v_player_id, v_player_name;

    if not found then
      select p.id, p.name
        into v_player_id, v_player_name
        from public.players p
       where lower(p.name) = lower(v_name)
       order by p.id
       limit 1;
    end if;
  end if;

  return query select v_player_id, v_player_name;
end;
$$;

revoke all on function public.get_or_create_skate_manager_player(text) from public;
grant execute on function public.get_or_create_skate_manager_player(text) to authenticated;

-- Keep the manager's safe, limited player lookup available to both add flows.
grant select on public.skate_manager_players to authenticated;
