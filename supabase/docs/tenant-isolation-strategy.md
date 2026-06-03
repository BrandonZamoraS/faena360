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
