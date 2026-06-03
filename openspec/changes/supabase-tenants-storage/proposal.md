# Proposal: Supabase Tenants and Tenant-Aware Storage

## Intent

Implement the tenant foundation data layer and tenant-aware file storage in Supabase, as required by the enunciado (parts 9, 10, 12): every operational record belongs to exactly one tenant, storage files must be isolated by tenant via RLS, and backend validation must enforce tenant separation. This is the database/infrastructure prerequisite for all future multitenant features. GitHub issue #4.

## Scope

### In Scope
- `tenants` table with minimum identity and operating fields (id, name, slug, timezone, currency, status, timestamps)
- Row-Level Security on `tenants` scoped to JWT `app_metadata.tenant_id`
- `tenant-files` storage bucket (not public) with RLS policies enforcing tenant_id as first path segment
- Supabase CLI configuration (`config.toml`)
- Documentation of tenant isolation strategy (JWT claim, path convention, MVP constraints)
- Empty `seed.sql` placeholder for future onboarding data

### Out of Scope
- Authentication, login, sessions (phase 1.1)
- User-to-tenant relationship enforcement (requires auth tables)
- First admin creation flow
- Image compression pipeline (resize, format conversion, HEIC handling)
- File upload size limits (8 MB per enunciado)
- Environment variables, CI/CD, health endpoint (separate changes)
- Client-side application code

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `infraestructura-base`: Refines "Tenant foundation data" and "Tenant isolation for storage and access" requirements with MVP constraints, storage bucket security, and path convention enforceable at the database level.

## Approach

Supabase-managed Postgres with RLS policies reading `tenant_id` from JWT `app_metadata`. Storage uses a dedicated `tenant-files` bucket with policies that enforce the first path segment equals the requesting user's `tenant_id`. Tenant creation restricted to service role during MVP (manual by developer/support). Seeded documentation captures the isolation contract for future phases.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/config.toml` | New | Supabase CLI project configuration |
| `supabase/migrations/20250602000000_init_tenants_and_storage.sql` | New | Tenant table, RLS, storage bucket and policies |
| `supabase/docs/tenant-isolation-strategy.md` | New | JWT claim approach, path convention, MVP constraints |
| `supabase/seed.sql` | New | Empty placeholder for future onboarding data |
| `openspec/specs/infraestructura-base/spec.md` | Modified | Add MVP constraints and storage security requirements |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JWT `app_metadata.tenant_id` not set before auth phase | Medium | Document dependency in strategy doc; phase 1.1 must populate claim before any tenant-scoped access |
| Path convention bypass via direct API without folder check | Low | RLS policies enforce first path segment; app-level code must also validate |
| Single-tenant-per-user assumption changes in future | Medium | Strategy doc marks MVP constraint; design allows future multi-tenant users via claim array |

## Rollback Plan

Drop the migration: `supabase migration down`. Remove `supabase/config.toml`, `docs/`, and `seed.sql`. The `tenant-files` bucket and all policies are removed with the migration. No application code depends on these tables yet.

## Dependencies

- Supabase CLI installed and initialized (`supabase init`)
- GitHub issue #4 approved
- Enunciado parts 9 (roles, files, storage), 10 (multitenancy), 12 (backend/DB validation)

## Success Criteria

- [ ] `tenants` table exists with id, name, slug, timezone, currency, status, created_at, updated_at
- [ ] RLS enabled on `tenants`; select/update policies scope to JWT `tenant_id`
- [ ] `tenant-files` bucket exists with `public = false`
- [ ] Storage RLS policies enforce `tenant_id` as first path segment for CRUD
- [ ] `tenant-isolation-strategy.md` documents JWT claim, path convention, MVP constraints
- [ ] `seed.sql` is empty but present for future use
- [ ] No public read access on any tenant-scoped data or files
