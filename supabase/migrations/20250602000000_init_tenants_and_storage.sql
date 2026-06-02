-- Tenant foundation and tenant-aware storage setup
-- Phase: 1.0 Infrastructure (MVP)
-- Auth, full roles, and UI tenant creation belong to phase 1.1.

-- --------------------------------------------------------
-- tenants table
-- --------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (length(trim(slug)) > 0),
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automatic updated_at trigger
-- Uses the built-in moddatetime extension handled by Supabase, but we define our own
-- lightweight trigger to avoid relying on an extra extension if not present.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger tenants_updated_at
  before update on tenants
  for each row
  execute function set_updated_at();

-- --------------------------------------------------------
-- Row Level Security (RLS) on tenants
-- --------------------------------------------------------
alter table tenants enable row level security;

-- Users can only read the tenant they belong to.
-- tenant_id is expected in auth.jwt() -> app_metadata -> tenant_id.
create policy "Users can view their own tenant"
  on tenants
  for select
  using (id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- Users can only update the tenant they belong to.
create policy "Users can update their own tenant"
  on tenants
  for update
  using (id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid)
  with check (id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- Note: insert/delete on tenants is intentionally restricted.
-- Initial tenant creation in MVP is manual (service role / direct DB access).

-- --------------------------------------------------------
-- tenant-files bucket (no public access)
-- --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tenant-files', 'tenant-files', false);

-- --------------------------------------------------------
-- Storage RLS policies for tenant-aware access
-- --------------------------------------------------------
-- Path convention: tenant_id/module/entity_id/file_id.ext
-- The first folder name MUST be the tenant_id for enforcement.

-- Select: users can read objects inside their tenant folder.
create policy "Tenant users can select own files"
  on storage.objects
  for select
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'
  );

-- Insert: users can upload objects inside their tenant folder.
create policy "Tenant users can insert own files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'
  );

-- Update: users can overwrite objects inside their tenant folder.
create policy "Tenant users can update own files"
  on storage.objects
  for update
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'
  )
  with check (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'
  );

-- Delete: users can delete objects inside their tenant folder.
create policy "Tenant users can delete own files"
  on storage.objects
  for delete
  using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'
  );
