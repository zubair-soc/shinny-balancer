-- Authenticated staging users can use the manager app.
-- Turn off public sign-ups in Supabase Auth before applying this migration.
-- Only manually created or invited users should receive an account.

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

do $$
declare
  target record;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'create policy authenticated_manager_all on public.%I for all to authenticated using (true) with check (true)',
      target.tablename
    );
  end loop;
end
$$;

commit;
