-- Keep the rink choice simple; historical skate records keep their original values.
begin;

update public.skate_options
set is_active = false
where option_type = 'location'
  and lower(name) = lower('NAIT - Parking: Honk App');

commit;
