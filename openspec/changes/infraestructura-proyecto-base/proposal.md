# Proposal: Infraestructura proyecto base

## Intent

Convert the existing MVP Obsidian infrastructure spec into the first OpenSpec change so the team can run the SDD flow from a real Faena360 reference without writing implementation code yet.

## Scope

### In Scope
- Translate the referenced Obsidian infrastructure note into an OpenSpec change proposal.
- Define the spec domain for base platform infrastructure.
- Preserve the referenced constraints for multitenancy, storage isolation, environments, CI/CD, and health monitoring.

### Out of Scope
- Implement monorepo, Supabase, CI/CD, or monitoring.
- Define product behavior outside the referenced Obsidian and enunciado notes.

## Capabilities

### New Capabilities
- `infraestructura-base`: Base platform capability covering monorepo setup, web bootstrap, Supabase/Postgres, tenant-aware storage, environment validation, CI/CD, and technical health monitoring.

### Modified Capabilities
None.

## Approach

Create the first OpenSpec artifact chain from `obsidian-vault/04-specs/mvp/1.0-infraestructura-proyecto-base.md`, using the enunciado only to confirm tenant separation, tenant-aware storage, UTC/timezone rules, and backend/RLS enforcement boundaries.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/infraestructura-proyecto-base/proposal.md` | New | Proposal artifact for the demo change |
| `openspec/changes/infraestructura-proyecto-base/specs/infraestructura-base/spec.md` | New | Planned delta spec in next phase |
| `openspec/specs/infraestructura-base/spec.md` | New | Planned main capability spec |
| `obsidian-vault/04-specs/mvp/1.0-infraestructura-proyecto-base.md` | Referenced | Source note for scope and constraints |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mixing implementation decisions with undocumented product rules | Med | Limit content to the source note plus cited enunciado constraints |
| Capability too broad for later review | Med | Keep one infrastructure domain now; split in sdd-spec only if scenarios become unwieldy |

## Rollback Plan

Delete `openspec/changes/infraestructura-proyecto-base/` if the team decides to restart the OpenSpec demo with a different source note or capability split.

## Dependencies

- `obsidian-vault/04-specs/mvp/1.0-infraestructura-proyecto-base.md`
- `obsidian-vault/01-producto/enunciado-sistema/01-enunciado-parte-1.md`
- `obsidian-vault/01-producto/enunciado-sistema/09-enunciado-parte-9.md`
- `obsidian-vault/01-producto/enunciado-sistema/10-enunciado-parte-10.md`
- `obsidian-vault/01-producto/enunciado-sistema/12-enunciado-parte-12.md`

## Success Criteria

- [ ] OpenSpec proposal exists for `infraestructura-proyecto-base` and stays aligned with the referenced vault note.
- [ ] The proposal defines a clear new capability for the next `sdd-spec` phase.
