alter table public.v2b_ratings add column rater_user_id uuid references auth.users(id) on delete set null;
drop policy skate_manager_access on public.v2b_ratings;
create policy skate_manager_submit on public.v2b_ratings for insert to authenticated with check (public.is_skate_manager() and rater_user_id = auth.uid());
create schema if not exists private;
create or replace function private.attribute_v2_rating() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An authorized account is required';
  end if;
  new.rater_user_id := auth.uid();
  select coalesce(nullif(raw_user_meta_data->>'full_name',''), nullif(raw_user_meta_data->>'name',''), email, id::text)
    into new.rater from auth.users where id = auth.uid();
  return new;
end;
$$;
create or replace function private.average_v2_rating() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An authorized account is required';
  end if;
  perform id from public.players where id = new.player_id for update;
  update public.players set rating_v2b = (
    select round(avg(composite),1) from (
      select composite from public.v2b_ratings where player_id=new.player_id order by created_at desc, id desc limit 3
    ) recent
  ) where id=new.player_id;
  return new;
end;
$$;
revoke all on function private.attribute_v2_rating() from public, anon, authenticated;
revoke all on function private.average_v2_rating() from public, anon, authenticated;
create trigger attribute_v2_rating before insert on public.v2b_ratings for each row execute function private.attribute_v2_rating();
create trigger average_v2_rating after insert on public.v2b_ratings for each row execute function private.average_v2_rating();
