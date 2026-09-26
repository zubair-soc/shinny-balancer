-- Staging setup only. The policy below grants calendar settings access to all
-- signed-in users and must be replaced with the Admin role policy before live use.
begin;

alter table public.skates
  add column if not exists benchapp_event_uid text,
  add column if not exists is_archived boolean not null default false;

create unique index if not exists skates_benchapp_event_uid_key
  on public.skates (benchapp_event_uid);

create table if not exists public.benchapp_sync_settings (
  id smallint primary key default 1 check (id = 1),
  feed_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.benchapp_sync_settings enable row level security;
grant select, insert, update, delete on public.benchapp_sync_settings to authenticated;

drop policy if exists benchapp_sync_settings_staging_access on public.benchapp_sync_settings;
create policy benchapp_sync_settings_staging_access
  on public.benchapp_sync_settings
  for all to authenticated
  using (true)
  with check (true);

commit;
