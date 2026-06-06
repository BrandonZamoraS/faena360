-- Extend audit_log table with source tracing and JSONB diff columns
-- Adds source TEXT, old_value JSONB, new_value JSONB with IF NOT EXISTS guards.
-- Creates the table itself if it does not exist yet.

-- --------------------------------------------------------
-- audit_log table (idempotent create)
-- --------------------------------------------------------
create table if not exists audit_log (
  id bigint primary key generated always as identity,
  tenant_id uuid not null,
  actor_user_id uuid,
  target_user_id uuid,
  action text not null,
  source text not null default 'system',
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);

-- --------------------------------------------------------
-- Column additions with IF NOT EXISTS guards
-- --------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_log'
      and table_schema = current_schema()
      and column_name = 'source'
  ) then
    alter table audit_log add column source text not null default 'system';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_log'
      and table_schema = current_schema()
      and column_name = 'old_value'
  ) then
    alter table audit_log add column old_value jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_log'
      and table_schema = current_schema()
      and column_name = 'new_value'
  ) then
    alter table audit_log add column new_value jsonb;
  end if;
end;
$$;

-- --------------------------------------------------------
-- Indexes for query performance
-- --------------------------------------------------------
create index if not exists idx_audit_log_tenant_id on audit_log (tenant_id);
create index if not exists idx_audit_log_action on audit_log (action);
create index if not exists idx_audit_log_occurred_at on audit_log (occurred_at desc);
create index if not exists idx_audit_log_tenant_action
  on audit_log (tenant_id, action);

-- --------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------
alter table audit_log enable row level security;

-- Append-only: no UPDATE or DELETE allowed via RLS
create policy "Audit log is append-only"
  on audit_log
  for insert
  with check (true);

-- Read: users can only read audit entries for their own tenant
create policy "Users can read own tenant audit"
  on audit_log
  for select
  using (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- Service role bypasses RLS implicitly (Supabase convention)
