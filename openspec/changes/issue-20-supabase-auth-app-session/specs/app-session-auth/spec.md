# app-session-auth Specification

## Purpose

Define backend email/password authentication that returns a tenant-scoped Faena360 app session only after business authorization checks succeed.

## Requirements

### Requirement: Issue tenant-scoped app sessions

The system MUST authenticate with Supabase Auth and MUST return an app session only after tenant, profile, role, capability, and web-access checks succeed.

The successful app session MUST include `user_id`, `auth_user_id`, `tenant_id`, `email`, `roles`, `effective_capabilities`, and `status`.

#### Scenario: Successful login returns an authorized app session

- GIVEN valid email/password credentials
- AND the authenticated user has `app_metadata.tenant_id`, an existing local profile, an active tenant, an active user profile, and web access
- WHEN the backend login flow completes
- THEN the system returns a tenant-scoped app session with the required fields

#### Scenario: Tenant binding comes only from auth metadata

- GIVEN valid credentials for a user whose auth record has `app_metadata.tenant_id`
- WHEN the backend builds the app session
- THEN the system SHALL use only `app_metadata.tenant_id` to resolve the tenant
- AND the session SHALL be bound to that tenant

### Requirement: Enforce authorization gates before session creation

The system MUST reject login before session creation when required authorization data is missing or inactive.

`user_profiles.status` MUST be the source of truth for user activity and MUST support `active` and `inactive` values for this capability.

#### Scenario: Inactive user profile is denied

- GIVEN valid Supabase credentials and an existing local profile with `user_profiles.status` = `inactive`
- WHEN the backend login flow evaluates authorization
- THEN the system MUST reject the login with `inactive_user`

#### Scenario: Missing local profile is denied

- GIVEN valid Supabase credentials but no local profile for the tenant-scoped user
- WHEN the backend login flow evaluates authorization
- THEN the system MUST reject the login with `inactive_user`

#### Scenario: Inactive tenant is denied

- GIVEN valid Supabase credentials and a local profile for a tenant whose `tenants.status` is inactive
- WHEN the backend login flow evaluates authorization
- THEN the system MUST reject the login with `inactive_tenant`

### Requirement: Map login failures to the app auth vocabulary

The system MUST expose only these failure outcomes for this capability: `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, and `web_access_denied`.

#### Scenario: Invalid credentials are normalized

- GIVEN an email/password pair rejected by Supabase Auth
- WHEN the backend login flow handles the authentication failure
- THEN the system MUST return `invalid_credentials`

#### Scenario: Missing tenant metadata is normalized

- GIVEN valid Supabase credentials for a user without `app_metadata.tenant_id`
- WHEN the backend login flow attempts tenant resolution
- THEN the system MUST return `missing_tenant`

#### Scenario: Web access denial is normalized

- GIVEN valid Supabase credentials and an otherwise active user without web access through roles and effective capabilities
- WHEN the backend login flow evaluates authorization
- THEN the system MUST return `web_access_denied`
