-- Atomically remove a roster spot and optionally issue its fee as credit.
create or replace function public.remove_skate_player(p_registration_id bigint, p_issue_credit boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_registration public.skate_registrations%rowtype;
  v_skate public.skates%rowtype;
  v_player_id bigint;
  v_amount numeric;
begin
  if not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An Admin or Skate Manager role is required.' using errcode = '42501';
  end if;
  select * into v_registration from public.skate_registrations where id = p_registration_id for update;
  if not found then raise exception 'This player has already been removed.'; end if;
  select * into v_skate from public.skates where id = v_registration.skate_id;
  if p_issue_credit then
    if not coalesce(v_registration.is_paid, false) or coalesce(v_registration.is_waitlist, false) then
      raise exception 'Only paid roster spots are eligible for credit.';
    end if;
    v_player_id := v_registration.player_id;
    if v_player_id is null then
      select player_id into v_player_id from public.get_or_create_skate_manager_player(v_registration.player_name);
    end if;
    v_amount := nullif(regexp_replace(coalesce(v_skate.cost::text, ''), '[^0-9.]', '', 'g'), '')::numeric;
    if v_amount is null or v_amount <= 0 then raise exception 'Set a positive skate fee before issuing credit.'; end if;
    insert into public.player_credits (player_id, amount, reason, source_skate_id, status, created_by, created_at)
    values (v_player_id, v_amount, 'Removed from ' || coalesce(v_skate.title, 'skate'), v_skate.id, 'active', 'Roster removal', now());
  end if;
  delete from public.skate_registrations where id = p_registration_id;
end;
$$;
revoke all on function public.remove_skate_player(bigint, boolean) from public;
grant execute on function public.remove_skate_player(bigint, boolean) to authenticated;
