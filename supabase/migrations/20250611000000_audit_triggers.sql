-- Trigger-based audit logging infrastructure
--
-- Provides:
--   1. current_app_tenant_id() — extracts tenant from JWT or session config
--   2. set_audit_context()  — RPC to set session variables before mutations
--   3. audit_trigger()      — generic AFTER trigger for INSERT/UPDATE/DELETE
--   4. AFTER triggers on sensitive tables (tenants, user_profiles, roles,
--      role_capabilities, user_capability_overrides, tenant_configurations)
--
-- Application pattern:
--   SELECT set_audit_context('actor-uuid', 'web', 'target-uuid');
--   -- perform mutation → trigger fires atomically in same transaction
--
-- Sanitizes keys matching: *password* | *token* | *secret* | *api_key*

-- --------------------------------------------------------
-- Helper: current_app_tenant_id()
-- Tries session config first, falls back to JWT app_metadata.
-- --------------------------------------------------------
create or replace function current_app_tenant_id()
returns uuid
language plpgsql
stable
security definer
as $$
begin
  return coalesce(
    nullif(current_setting('app.current_tenant_id', true), '')::uuid,
    nullif((auth.jwt() -> 'app_metadata' ->> 'tenant_id'), '')::uuid
  );
exception
  when others then
    return null;
end;
$$;

-- --------------------------------------------------------
-- RPC: set_audit_context(actor_id, source, target_id)
-- Sets session config variables consumed by audit_trigger().
-- Uses session-level (is_local=false) so context persists across
-- statements in the same database session.
--
-- SECURITY: Revoked from public; only service_role or authenticated
-- users with explicit grants should execute this.
-- --------------------------------------------------------
create or replace function set_audit_context(
  actor_id uuid,
  source text,
  target_id uuid default null
)
returns void
language plpgsql
security definer
as $$
begin
  perform set_config('app.current_actor_id', actor_id::text, false);
  perform set_config('app.audit_source', source, false);
  if target_id is not null then
    perform set_config('app.audit_target_id', target_id::text, false);
  else
    perform set_config('app.audit_target_id', '', false);
  end if;
end;
$$;

-- Revoke from public to prevent clients from spoofing audit context
revoke execute on function set_audit_context(uuid, text, uuid) from public;

-- --------------------------------------------------------
-- Trigger function: audit_trigger()
-- Reads session vars, computes JSONB diff (changed fields only),
-- sanitizes sensitive keys, and inserts into audit_log.
--
-- SECURITY: Derives tenant_id from the mutated row when possible,
-- with a fallback to current_app_tenant_id().
-- Clears audit context after writing to prevent cross-request leakage.
-- --------------------------------------------------------
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
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'user_capability_overrides' then
    _tenant_id := coalesce(NEW.tenant_id, OLD.tenant_id);
  elsif TG_TABLE_NAME = 'tenant_configurations' then
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

-- --------------------------------------------------------
-- Attach AFTER triggers to sensitive tables
-- Uses dynamic SQL with existence checks so the migration
-- succeeds even when some tables don't exist yet.
-- Tables that don't exist will get their triggers in their
-- own creation migrations.
-- --------------------------------------------------------
do $$
declare
  _tables text[] := array[
    'tenants',
    'user_profiles',
    'roles',
    'role_capabilities',
    'user_capability_overrides',
    'tenant_configurations'
  ];
  _tbl text;
  _trigger_name text;
begin
  foreach _tbl in array _tables loop
    if exists (
      select 1 from information_schema.tables
      where table_name = _tbl
        and table_schema = current_schema()
    ) then
      _trigger_name := 'audit_' || _tbl || '_trigger';

      -- Drop existing trigger if present (idempotent)
      execute format(
        'drop trigger if exists %I on %I',
        _trigger_name, _tbl
      );

      -- Create AFTER trigger for INSERT, UPDATE, DELETE
      execute format(
        'create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()',
        _trigger_name, _tbl
      );
    end if;
  end loop;
end;
$$;
