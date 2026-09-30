-- Stores the current NAIT parking code for inclusion in WhatsApp skate rosters.
begin;

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, public;
grant select, insert, update on public.app_settings to authenticated;

drop policy if exists app_settings_authenticated_read on public.app_settings;
create policy app_settings_authenticated_read
  on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write
  on public.app_settings
  for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') @> '["admin"]'::jsonb, false)
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or coalesce((auth.jwt() -> 'app_metadata' -> 'roles') @> '["admin"]'::jsonb, false)
  );

insert into public.app_settings (key, value)
values ('nait_parking_code', '')
on conflict (key) do nothing;

commit;
