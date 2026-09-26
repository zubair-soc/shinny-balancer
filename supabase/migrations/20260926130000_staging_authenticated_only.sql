-- Restrict the single-operator staging project to signed-in Supabase Auth users.
-- Signup must remain disabled and only trusted staging users should be created.
-- This is not the final multi-group production policy: every authenticated user
-- can still manage every row. Do not apply this unchanged to production.

begin;

-- Remove signed-out API access while retaining the signed-in manager workflow.
revoke all privileges on all tables in schema public from anon, public;
revoke all privileges on all sequences in schema public from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- New tables stay closed until a migration explicitly grants and secures them.
alter default privileges in schema public revoke all on tables from anon, public, authenticated;
alter default privileges in schema public revoke all on sequences from anon, public, authenticated;

do $staging_access$
declare
  target record;
  existing_policy record;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target.tablename
    loop
      execute format(
        'drop policy %I on public.%I',
        existing_policy.policyname,
        target.tablename
      );
    end loop;

    execute format(
      'create policy staging_authenticated_access on public.%I for all to authenticated using (true) with check (true)',
      target.tablename
    );
  end loop;
end
$staging_access$;

commit;
