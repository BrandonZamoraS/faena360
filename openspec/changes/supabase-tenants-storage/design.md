# Design: Supabase Tenants and Tenant-Aware Storage

**Retroactive**: Implementation already exists on branch `feat/supabase-tenants-storage` at commit `d9f0c99`. This design documents what was built and why.

## Technical Approach

Postgres-managed via Supabase CLI. `tenants` table with UUID PK, unique slug, timezone/currency defaults, and `timestamptz` timestamps. RLS on `tenants` reads `tenant_id` from JWT `app_metadata`. `tenant-files` storage bucket with `public = false`; four storage policies enforce the first path segment (`storage.foldername(name)[1]`) equals the user's JWT `tenant_id`. No insert/delete policies on `tenants` for regular users — service role only in MVP.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tenant identity source | JWT `app_metadata.tenant_id` | Available in every Supabase request (SQL, REST, Storage); avoids extra joins; explicit in backend rules |
| Storage isolation | Path-segment enforcement (`storage.foldername(name)[1] = tenant_id`) | Postgres-native, indexable; works with Supabase Storage RLS without custom functions |
| MVP tenant creation | Service role / manual only | Enunciado specifies manual creation in MVP; UI onboarding is future phase 1.1 |
| Slug uniqueness | `UNIQUE` column constraint | Human-readable tenant identifier; no separate slug table needed at this scale |
| Status enum | `CHECK (status IN ('active','inactive','suspended'))` | Enum via check constraint; easy to extend; avoids creating a separate statuses table for MVP |
| Updated-at trigger | Custom `set_updated_at()` function | Lightweight; avoids requiring the `moddatetime` Supabase extension which may not be present |
| Storage bucket visibility | `public = false` | Enunciado requires no cross-tenant access and no anonymous reads |

## Data Flow

```
Client Request ──→ Supabase Auth (JWT with app_metadata.tenant_id)
                      │
                      ├── SQL Query ──→ RLS Policy (auth.jwt()->app_metadata->>tenant_id)
                      │                     └── Filter rows where id = tenant_id
                      │
                      └── Storage Op ──→ RLS Policy (storage.foldername(name)[1])
                                            └── Enforce path prefix = tenant_id
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/config.toml` | Create | Supabase CLI project configuration (project ID, API, DB, auth, storage settings) |
| `supabase/migrations/20250602000000_init_tenants_and_storage.sql` | Create | Migration: tenants table, set_updated_at trigger, RLS policies on tenants, tenant-files bucket, storage RLS policies |
| `supabase/docs/tenant-isolation-strategy.md` | Create | Architecture decision record: JWT claim approach, path convention, MVP constraints, phase 1.1 dependency |
| `supabase/seed.sql` | Create | Empty placeholder; tenant creation is manual in MVP |

## Interfaces / Contracts

### `tenants` Table Schema

```sql
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE CHECK (length(trim(slug)) > 0),
  timezone   TEXT NOT NULL DEFAULT 'UTC',
  currency   TEXT NOT NULL DEFAULT 'USD',
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Storage Path Convention

```
tenant_id / module / entity_id / file_id.ext
    │          │          │         │
    │          │          │         └─ Generated filename
    │          │          └─────────── Business entity UUID
    │          └────────────────────── Module name (jornadas, mantenimiento, etc.)
    └───────────────────────────────── MUST equal JWT tenant_id (enforced by RLS)
```

### RLS Policy Matrix

| Operation | Table/Resource | Policy Expression |
|-----------|---------------|-------------------|
| SELECT | `tenants` | `id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid` |
| UPDATE | `tenants` | Same as SELECT (USING + WITH CHECK) |
| INSERT | `tenants` | ❌ No policy (service role only) |
| DELETE | `tenants` | ❌ No policy (service role only) |
| SELECT | `storage.objects` (bucket=tenant-files) | `(storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'tenant_id'` |
| INSERT | `storage.objects` (bucket=tenant-files) | Same path check (WITH CHECK) |
| UPDATE | `storage.objects` (bucket=tenant-files) | Same path check (USING + WITH CHECK) |
| DELETE | `storage.objects` (bucket=tenant-files) | Same path check (USING) |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration | RLS on tenants (select/update by JWT claim) | `supabase test db` or SQL assertions with `set role` |
| Integration | RLS on storage (CRUD by path prefix) | `supabase test db` or SQL assertions with `set role` |
| Integration | Slug uniqueness constraint | Insert duplicate slug, expect violation |
| Integration | Status check constraint | Insert invalid status, expect violation |
| Integration | No public read on tenant-files bucket | Anonymous request to storage, expect 403 |
| Unit | `set_updated_at()` trigger | Update a tenant row, verify `updated_at` advances |

## Migration / Rollout

No data migration required — this is the initial schema. Rollback: `supabase migration down` removes all objects created by the migration. The `tenant-files` bucket and its policies are removed with the migration.

## Open Questions

- [ ] Should `tenants.slug` be auto-generated from `name` (slugify) or always manually provided? Enunciado does not specify.
- [ ] Should `timezone` and `currency` have check constraints for valid IANA timezones and ISO 4217 codes? Enunciado says timezone "se define al crear la empresa" and currency "moneda configurada" but does not specify validation rules for the MVP.
- [ ] Phase 1.1 must populate `app_metadata.tenant_id` on login — is the auth trigger design finalized?
