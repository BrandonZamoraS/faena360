# Delta for Authorization Base

## MODIFIED Requirements

### Requirement: Local user profiles

The system MUST persist local user profiles linked to a tenant and a platform identity. Email and phone identifiers MUST be globally unique when present, enforced on BOTH create and update paths. When updating a user's phone, the system MUST check the new phone against all OTHER users and MUST allow the same user to keep their existing phone. The `updateUser` use case MUST return `duplicate_identifier` when the updated phone belongs to a different user.
(Previously: phone uniqueness was enforced only on create via `identifierExists`; the update path lacked any uniqueness check.)

#### Scenario: Profile is stored for a tenant user

- GIVEN a valid platform user and tenant
- WHEN a local profile is created
- THEN the profile is linked to exactly one tenant and one platform identity

#### Scenario: Duplicate contact data on create is rejected

- GIVEN an existing profile with the same email or phone
- WHEN another profile uses that same global identifier on create
- THEN the write is rejected with `duplicate_identifier`

#### Scenario: Duplicate phone on update is rejected

- GIVEN user A has phone "11234567890" and user B has phone "999"
- WHEN user B's profile is updated to use phone "11234567890"
- THEN `updateUser` returns `{ ok: false, code: "duplicate_identifier" }`

#### Scenario: Same-phone update is allowed (self-exclusion)

- GIVEN user A has phone "11234567890"
- WHEN user A's profile is updated with the same phone "11234567890" and a new fullName
- THEN the update succeeds, profile changes are persisted, and audit is recorded
