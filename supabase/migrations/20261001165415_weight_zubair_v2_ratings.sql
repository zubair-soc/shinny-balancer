alter table public.v2b_ratings
  add column if not exists rater_weight numeric not null default 1;

alter table public.v2b_ratings
  drop constraint if exists v2b_ratings_rater_weight_check;

alter table public.v2b_ratings
  add constraint v2b_ratings_rater_weight_check
  check (rater_weight > 0 and rater_weight <= 5);

update public.v2b_ratings r
set rater_weight = 2
where lower(r.rater) in ('zubair', 'zubair@shinnyofchampions.com')
   or r.rater_user_id = (
     select u.id
     from auth.users u
     where lower(u.email) = 'zubair@shinnyofchampions.com'
     limit 1
   );

create or replace function private.attribute_v2_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rater_email text;
begin
  if auth.uid() is null or not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An authorized account is required';
  end if;

  new.rater_user_id := auth.uid();

  select
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      u.email,
      u.id::text
    ),
    lower(u.email)
  into new.rater, rater_email
  from auth.users u
  where u.id = auth.uid();

  new.rater_weight := case
    when rater_email = 'zubair@shinnyofchampions.com' then 2
    else 1
  end;

  return new;
end;
$$;

create or replace function private.average_v2_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (public.is_skate_admin() or public.is_skate_manager()) then
    raise exception 'An authorized account is required';
  end if;

  perform p.id
  from public.players p
  where p.id = new.player_id
  for update;

  update public.players p
  set rating_v2b = (
    select round(
      sum(recent.composite * recent.rater_weight)
      / nullif(sum(recent.rater_weight), 0),
      1
    )
    from (
      select
        r.composite,
        coalesce(r.rater_weight, 1) as rater_weight
      from public.v2b_ratings r
      where r.player_id = new.player_id
      order by r.created_at desc, r.id desc
      limit 3
    ) recent
  )
  where p.id = new.player_id;

  return new;
end;
$$;

revoke all on function private.attribute_v2_rating() from public, anon, authenticated;
revoke all on function private.average_v2_rating() from public, anon, authenticated;
