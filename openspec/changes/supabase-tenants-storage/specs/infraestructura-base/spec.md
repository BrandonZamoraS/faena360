# Delta for Infraestructura Base

## ADDED Requirements

### Requirement: MVP Tenant Creation Restriction

The system MUST restrict tenant creation and deletion to the service role during MVP. Regular authenticated users MUST NOT insert into or delete from the `tenants` table. Tenant onboarding is performed manually by developer or support staff.

(Previously: The base spec stated "minimum identity and operating fields" but did not specify creation constraints.)

#### Scenario: Regular user cannot create tenants

- GIVEN an authenticated user with a JWT containing `tenant_id` in `app_metadata`
- WHEN the user attempts to insert a row into the `tenants` table
- THEN the database MUST reject the operation

#### Scenario: Regular user cannot delete tenants

- GIVEN an authenticated user with a JWT containing `tenant_id` in `app_metadata`
- WHEN the user attempts to delete a row from the `tenants` table
- THEN the database MUST reject the operation

#### Scenario: Service role creates tenant manually

- GIVEN a developer or support person with service-role access
- WHEN they create a tenant row with name, slug, timezone, and currency
- THEN the row is inserted and the tenant becomes available for association

### Requirement: Storage Bucket Security

The system MUST provision a `tenant-files` storage bucket with public access disabled. No anonymous or unauthenticated read access MUST be allowed to any object in the bucket.

#### Scenario: Bucket is not publicly accessible

- GIVEN the `tenant-files` bucket exists
- WHEN an unauthenticated request attempts to read any object
- THEN the request MUST be denied

#### Scenario: Bucket flag confirms private access

- GIVEN the `tenant-files` bucket configuration
- WHEN the bucket metadata is inspected
- THEN the `public` flag MUST be `false`

### Requirement: Storage Path Convention Enforcement

The system MUST enforce that the first path segment of any object in `tenant-files` equals the requesting user's `tenant_id`. Path convention: `tenant_id/module/entity_id/file_id.ext`.

#### Scenario: User uploads file to own tenant folder

- GIVEN a user with JWT `app_metadata.tenant_id = "a1b2c3d4"`
- WHEN they upload a file to path `a1b2c3d4/jornadas/j56/photo1.jpg`
- THEN the storage policy MUST allow the operation

#### Scenario: User cannot upload to another tenant's folder

- GIVEN a user with JWT `app_metadata.tenant_id = "a1b2c3d4"`
- WHEN they attempt to upload a file to path `x9y8z7w6/jornadas/j99/photo1.jpg`
- THEN the storage policy MUST reject the operation

#### Scenario: User cannot read another tenant's files

- GIVEN a user with JWT `app_metadata.tenant_id = "a1b2c3d4"`
- WHEN they attempt to select an object in the `x9y8z7w6/` path prefix
- THEN the storage policy MUST return no results

## MODIFIED Requirements

### Requirement: Tenant Isolation for Storage and Access

The system MUST enforce tenant isolation in backend-controlled data and file access. A user MUST belong to only one tenant in the MVP, the active `tenant_id` MUST be available via JWT `app_metadata` claim for all backend enforcement, and storage access MUST use tenant-aware paths where the first path segment equals the user's `tenant_id`. The system MUST NOT provide public or anonymous access to tenant-scoped data or files.

(Previously: "storage access MUST use tenant-aware paths through a provider-agnostic application port" — updated to specify JWT claim source, first-path-segment enforcement, and explicit no-public-access constraint.)

#### Scenario: Tenant-scoped storage access

- GIVEN a file operation for tenant-owned content
- WHEN the backend prepares the access request
- THEN the storage target is resolved under a path starting with the user's `tenant_id` and business rules enforce tenant isolation at the database level rather than relying solely on application-layer filtering

#### Scenario: Critical validation is not delegated away

- GIVEN a protected data or storage operation
- WHEN authorization is evaluated
- THEN tenant enforcement is performed by RLS policies reading `app_metadata.tenant_id` from the JWT claim, not only by UI, AI, or workflow tooling

#### Scenario: JWT claim carries tenant identity

- GIVEN an authenticated user
- WHEN the system evaluates any tenant-scoped operation
- THEN the active `tenant_id` is read from `auth.jwt()->'app_metadata'->>'tenant_id'` in Postgres and `auth.jwt()->'app_metadata'->>'tenant_id'` in Storage policies

## REMOVED Requirements

None.
