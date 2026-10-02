create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table private.credit_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  event_type text not null,
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  actor_roles jsonb,
  credit_id integer,
  player_id integer,
  amount_before numeric,
  amount_after numeric,
  status_before text,
  status_after text,
  source_skate_id integer,
  used_on_skate_id integer,
  reason text,
  request_method text,
  request_path text,
  old_row jsonb,
  new_row jsonb
);

alter table private.credit_audit_log enable row level security;

revoke all on table private.credit_audit_log from public, anon, authenticated;
revoke all on sequence private.credit_audit_log_id_seq from public, anon, authenticated;

create index credit_audit_log_occurred_at_idx
  on private.credit_audit_log (occurred_at desc);

create index credit_audit_log_actor_user_id_idx
  on private.credit_audit_log (actor_user_id, occurred_at desc);

create index credit_audit_log_player_id_idx
  on private.credit_audit_log (player_id, occurred_at desc);

create or replace function private.log_player_credit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  audit_event_type text;
  old_data jsonb;
  new_data jsonb;
begin
  if tg_op <> 'INSERT' then
    old_data := to_jsonb(old);
  end if;

  if tg_op <> 'DELETE' then
    new_data := to_jsonb(new);
  end if;

  if tg_op = 'INSERT' then
    audit_event_type := case
      when new.status = 'active' then 'issued'
      when new.status = 'used' then 'use_record_created'
      else 'created'
    end;
  elsif tg_op = 'DELETE' then
    audit_event_type := 'deleted';
  elsif old.status is distinct from new.status and new.status = 'used' then
    audit_event_type := 'used';
  elsif old.amount > new.amount and new.status = 'active' then
    audit_event_type := 'partially_used';
  else
    audit_event_type := 'updated';
  end if;

  insert into private.credit_audit_log (
    operation,
    event_type,
    actor_user_id,
    actor_email,
    actor_role,
    actor_roles,
    credit_id,
    player_id,
    amount_before,
    amount_after,
    status_before,
    status_after,
    source_skate_id,
    used_on_skate_id,
    reason,
    request_method,
    request_path,
    old_row,
    new_row
  ) values (
    tg_op,
    audit_event_type,
    auth.uid(),
    lower(jwt_claims ->> 'email'),
    coalesce(
      jwt_claims -> 'app_metadata' ->> 'role',
      jwt_claims ->> 'role',
      case when auth.uid() is null then 'system' end
    ),
    jwt_claims -> 'app_metadata' -> 'roles',
    coalesce(new.id, old.id),
    coalesce(new.player_id, old.player_id),
    old.amount,
    new.amount,
    old.status,
    new.status,
    coalesce(new.source_skate_id, old.source_skate_id),
    coalesce(new.used_on_skate_id, old.used_on_skate_id),
    coalesce(new.reason, old.reason),
    current_setting('request.method', true),
    current_setting('request.path', true),
    old_data,
    new_data
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function private.log_player_credit_change() from public, anon, authenticated;

drop trigger if exists player_credits_audit_trigger on public.player_credits;

create trigger player_credits_audit_trigger
after insert or update or delete on public.player_credits
for each row execute function private.log_player_credit_change();
