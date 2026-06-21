create or replace function public.audit_clientes_trigger()
returns trigger
language plpgsql
as $$
declare
  _actor_id uuid := nullif(current_setting('app.current_actor_id', true), '')::uuid;
  _source text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'system');
  _target_id uuid := nullif(current_setting('app.audit_target_id', true), '')::uuid;
  _action text;
  _old_value jsonb := null;
  _new_value jsonb := null;
begin
  _action := 'cliente.' ||
    case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
    end;

  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, value)
    into _old_value
    from jsonb_each(to_jsonb(old))
    where key not in ('created_at', 'updated_at')
      and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;

    select jsonb_object_agg(key, value)
    into _new_value
    from jsonb_each(to_jsonb(new))
    where key not in ('created_at', 'updated_at')
      and to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
  elsif TG_OP = 'INSERT' then
    _new_value := to_jsonb(new);
  elsif TG_OP = 'DELETE' then
    _old_value := to_jsonb(old);
  end if;

  insert into audit_log (
    tenant_id,
    actor_user_id,
    target_user_id,
    action,
    source,
    old_value,
    new_value,
    occurred_at
  ) values (
    case when TG_OP = 'DELETE' then old.tenant_id else new.tenant_id end,
    _actor_id,
    _target_id,
    _action,
    _source,
    _old_value,
    _new_value,
    now()
  );

  perform set_config('app.current_actor_id', '', false);
  perform set_config('app.audit_source', '', false);
  perform set_config('app.audit_target_id', '', false);

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
