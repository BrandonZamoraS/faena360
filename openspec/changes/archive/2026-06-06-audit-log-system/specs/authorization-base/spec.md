# Delta for Authorization Base

## MODIFIED Requirements

### Requirement: Minimal authorization audit history

The system MUST persist audit records for authorization changes with actor, target, action, and event timestamp data. Authorization audit behavior is delegated to the `audit-log-system` capability, which provides source tracing, before/after JSONB diffs, and sensitive field sanitization.

(Previously: Required minimal audit records and explicitly disallowed richer detail fields beyond MVP scope.)

#### Scenario: Authorization change creates a minimal audit record
- GIVEN a role, assignment, or override change
- WHEN the change is stored
- THEN a minimal audit record can capture who acted, what changed, and when

#### Scenario: Authorization audit uses full audit-log-system
- GIVEN the audit-log-system capability is active
- WHEN an authorization mutation is audited
- THEN source, old_value, and new_value JSONB diffs are captured per audit-log-system spec

#### Scenario: Sensitive authorization changes are audited
- GIVEN a supervisor modifies role permissions or creates capability overrides
- WHEN the change is stored
- THEN an audit entry records the actor, target, source, and mutation details per audit-log-system
