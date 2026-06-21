-- Hotfix migration for issue #47.
-- Ensures audit_trigger() can derive tenant_id from row data for
-- categories table rows when inserts are done via service role without
-- an authenticated JWT/app tenant setting.

create or replace function audit_trigger()
returns trigger
language plpgsql
as $$
declare
  _actor_id  uuid   := nullif(current_setting('app.current_actor_id', true), '')::uuid;
  _source    text   := coalesce(nullif(current_setting('app.audit_source', true), ''), 'system');
  _target_id uuid   := nullif(current_setting('app.audit_target_id', true), '')::uuid;
  _tenant_id uuid;
  _old_val   jsonb  := null;
  _new_val   jsonb  := null;
  _action    text;
  _table_singular text;
begin
  -- Derive tenant_id from the mutated row when possible
  if TG_TABLE_NAME = 'tenants' then
    _tenant_id := coalesce(NEW.id, OLD.id);
  elsif TG_TABLE_NAME = 'user_profiles' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'roles' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'role_capabilities' then
    select roles.tenant_id
    into _tenant_id
    from roles
    where roles.id = coalesce(NEW.role_id, OLD.role_id);
  elsif TG_TABLE_NAME = 'user_capability_overrides' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'tenant_configurations' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'categorias_gastos' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  else
    _tenant_id := current_app_tenant_id();
  end if;

  -- Singularize table name for consistent action naming
  _table_singular := case TG_TABLE_NAME
    when 'tenants' then 'tenant'
    when 'user_profiles' then 'user'
    when 'roles' then 'role'
    when 'role_capabilities' then 'capability'
    when 'user_capability_overrides' then 'override'
    when 'tenant_configurations' then 'config'
    else TG_TABLE_NAME
  end;

  -- Build action name: {singular}.{operation}
  _action := _table_singular || '.' ||
    case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
    end;

  -- Compute diff: changed fields only for UPDATE, full row for INSERT/DELETE
  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, value)
    into _old_val
    from jsonb_each(to_jsonb(OLD))
    where to_jsonb(NEW) -> key is distinct from to_jsonb(OLD) -> key;

    select jsonb_object_agg(key, value)
    into _new_val
    from jsonb_each(to_jsonb(NEW))
    where to_jsonb(NEW) -> key is distinct from to_jsonb(OLD) -> key;
  elsif TG_OP = 'INSERT' then
    _new_val := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    _old_val := to_jsonb(OLD);
  end if;

  -- Sanitize sensitive keys: *password* | *token* | *secret* | *api_key*
  if _old_val is not null then
    select jsonb_object_agg(
      key,
      case
        when key ~* 'password|token|secret|api_key'
        then '"[REDACTED]"'::jsonb
        else value
      end
    ) into _old_val
    from jsonb_each(_old_val);
  end if;

  if _new_val is not null then
    select jsonb_object_agg(
      key,
      case
        when key ~* 'password|token|secret|api_key'
        then '"[REDACTED]"'::jsonb
        else value
      end
    ) into _new_val
    from jsonb_each(_new_val);
  end if;

  -- Insert audit entry
  insert into audit_log (
    tenant_id, actor_user_id, target_user_id,
    action, source, old_value, new_value, occurred_at
  ) values (
    _tenant_id, _actor_id, _target_id,
    _action, _source, _old_val, _new_val, now()
  );

  -- Clear session context after use to prevent cross-request leakage
  perform set_config('app.current_actor_id', '', false);
  perform set_config('app.audit_source', '', false);
  perform set_config('app.audit_target_id', '', false);

  return coalesce(NEW, OLD);
end;
$$;
