# Tenant Isolation Strategy

## Overview

Faena360 is a multitenant system where every operational record belongs to exactly one tenant (company). This document defines the initial isolation strategy for the database (RLS) and Supabase Storage, implemented in phase `1.0 Infraestructura`.

## Where `tenant_id` Lives

For fast enforcement in both Postgres RLS and Storage policies, the active `tenant_id` is stored in the **JWT `app_metadata`** claim:

```json
{
  "sub": "<user-uuid>",
  "app_metadata": {
    "tenant_id": "<tenant-uuid>"
  }
}
```

RLS policies read it via:

```sql
(auth.jwt()->'app_metadata'->>'tenant_id')::uuid
```

Storage policies read it via:

```sql
auth.jwt()->'app_metadata'->>'tenant_id'
```

## Why `app_metadata`?

- It is part of the Supabase Auth JWT and available automatically in every request (SQL, REST, Storage).
- It avoids extra joins or lookups for every row check.
- It keeps the tenant boundary explicit and verifiable in backend rules.

## MVP Constraints

- **Single-tenant-per-user**: A user belongs to exactly one tenant in the MVP.
- **No UI tenant creation**: Tenants are created manually by the developer/support during onboarding.
- **No auth/roles in this phase**: Authentication, login, sessions, first-admin flows, and full role/capability models are implemented in phase `1.1 Autenticación multitenant`.
- **Future company data tables** must include `tenant_id` and enforce it at the database level.

## Storage Rules

- **Bucket**: `tenant-files` (not public).
- **Path convention**: `tenant_id/module/entity_id/file_id.ext`
  - Example: `a1b2c3d4/jornadas/j56/photo1.jpg`
- **Enforcement**: The first path segment must equal the requesting user's `tenant_id`.
- **No improper public access**: The bucket has `public = false` and there are no anonymous read policies.

## App-Level Filtering

RLS and Storage policies are the safety net. The application must **also** explicitly filter by tenant where applicable to avoid relying solely on the database layer.

## Phase 1.1 Dependency

When auth is implemented, the login/session flow must ensure `app_metadata.tenant_id` is set correctly before the user can access any tenant-scoped data.

---

## Authorization Table RLS (Phase 1.1 — Issue #16)

### `current_app_tenant_id()` Helper

All authorization-table RLS policies rely on a single helper function instead of repeating raw JWT casts:

```sql
create or replace function public.current_app_tenant_id()
returns uuid language plpgsql stable as $$
begin
  return nullif(auth.jwt()->'app_metadata'->>'tenant_id', '')::uuid;
exception when invalid_text_representation then
  return null;
end $$;
```

**Contract:**
- Returns the `uuid` tenant ID from the current JWT's `app_metadata.tenant_id`.
- Returns `NULL` when the claim is missing, empty, or not a valid UUID.
- Marked `STABLE` so PostgreSQL caches the result within a single query.

### RLS-Protected Authorization Tables

| Table | Policy type | Isolation method |
|---|---|---|
| `user_profiles` | SELECT / INSERT / UPDATE / DELETE-deny | Direct `tenant_id` column |
| `roles` | SELECT / INSERT / UPDATE | Direct `tenant_id` column |
| `user_roles` | SELECT / INSERT / UPDATE / DELETE | Join through `roles.tenant_id` |
| `role_capabilities` | SELECT / INSERT / UPDATE / DELETE | Join through `roles.tenant_id` |
| `user_capability_overrides` | SELECT / INSERT / UPDATE | Direct `tenant_id` column |
| `audit_log` | SELECT / INSERT / UPDATE | Direct `tenant_id` column |
| `capabilities` | *(none — global catalog)* | No tenant filter |

### Hard-Delete Denial on `user_profiles`

An explicit `FOR DELETE USING (false)` policy prevents application-level hard deletes of user profiles. This makes the prohibition visible and auditable, beyond the implicit default-deny of having no DELETE policy.

### `tenant_id` on `audit_log` and `user_capability_overrides`

Both tables now carry a `NOT NULL` `tenant_id` column with a foreign key to `tenants(id) ON DELETE CASCADE`. This ensures tenant isolation even when `actor_user_id` or `target_user_id` is `NULL` (e.g., system events or post-deletion audit history).

### Service-Role Bypass Warning

> **RLS does NOT apply to the `service_role`.** Supabase's `service_role` bypasses all RLS policies by design. Backend code running with the service-role key must enforce tenant boundaries at the application level. RLS is a safety net for client-side and PostgREST access, not a replacement for backend authorization controls.

### Issue 3 JWT Dependency

The entire RLS isolation depends on `app_metadata.tenant_id` being populated in the JWT. **Issue 3** must implement the login/session flow that sets this claim. Until then, `current_app_tenant_id()` returns `NULL` for real application sessions, and all tenant-scoped queries return zero rows.
