begin;

drop policy if exists admin_full_access on public.benchapp_sync_settings;
drop policy if exists benchapp_sync_settings_staging_access on public.benchapp_sync_settings;

create policy benchapp_owner_access
  on public.benchapp_sync_settings
  for all
  to authenticated
  using (
    public.is_skate_admin()
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'zubair@shinnyofchampions.com'
  )
  with check (
    public.is_skate_admin()
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'zubair@shinnyofchampions.com'
  );

commit;
