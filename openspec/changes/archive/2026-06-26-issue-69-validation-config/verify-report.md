# Verification Report: issue-69-validation-config

## Change
- Change: `issue-69-validation-config`
- Verify mode: fresh adversarial re-verification after follow-up fixes
- Artifact store: `openspec`
- Review budget: 400 lines (size exception acknowledged by owner)
- Verdict: **PASS WITH WARNINGS**

## Artifacts Read
- `openspec/changes/issue-69-validation-config/discovery-molecular-spec.md`
- `openspec/changes/issue-69-validation-config/design.md`
- `openspec/changes/issue-69-validation-config/verify-report.md` (previous fail state)
- Apply-progress artifact: **not present in openspec**

## Completed Slice Check
| Slice | Expected from design | Evidence | Status |
|---|---|---|---|
| 1 | Schema + isolation test | `supabase/migrations/20260626000002_create_tenant_validation_configs.sql`, `supabase/tests/tenant_validation_configs.sql` | Implemented; SQL runtime not executed locally because `DATABASE_URL` is missing |
| 2 | Contract + merge service | `packages/application/src/validation-config/*`, targeted Vitest pass | Implemented |
| 3 | Adapter + route | `packages/infrastructure/src/validation-config/*`, `apps/web/app/api/config/validacion/*`, targeted Vitest pass | Implemented |

## Build / Test Evidence
| Command | Result | Evidence |
|---|---|---|
| `pnpm vitest run apps/web/app/api/config/validacion/route.test.ts packages/application/src/validation-config/get-validation-config.test.ts packages/infrastructure/src/validation-config/SupabaseValidationConfigRepository.test.ts` | PASS | 3 files passed, 21 tests passed |
| `pnpm -r typecheck` | PASS | shared/domain/application/infrastructure/web typecheck passed |
| `pnpm lint` | PASS | workspace lint passed |
| `pnpm format:check` | FAIL (repo baseline, unrelated) | Prettier reported existing style issues across 157 files, many outside issue #69 scope |
| `psql -v ON_ERROR_STOP=1 $DATABASE_URL -f supabase/tests/tenant_validation_configs.sql` | NOT RUN | `DATABASE_URL_MISSING` in verifier environment |

## Spec Compliance Matrix
| Requirement / Scenario | Evidence | Status |
|---|---|---|
| GET endpoint exists at `/api/config/validacion?tipo=...` | `apps/web/app/api/config/validacion/route.ts`, route test | PASS |
| Supported tipos return tenant-aware `tipo`, `tenantId`, `campos` contract | service defaults/merge tests, route success test | PASS |
| Cross-tenant isolation | repository filters on `tenant_id` + `tipo`; tenant/user context lookup is tenant-scoped; SQL isolation test exists but was not executed locally | PASS WITH WARNING |
| Unsupported/malformed `tipo` returns `TIPO_INVALIDO` | route + service tests | PASS |
| Missing tenant context returns `TENANT_INVALIDO` | route test for blank header, service guard | PASS |
| Invalid tenant/user context returns `TENANT_INVALIDO` | route UUID validation + service UUID validation + focused runtime tests | PASS |
| Permissionless caller gets controlled denial and `whatsapp.channel.access` is enforced | route invalid-signature test, service capability denial test, repository capability lookup | PASS |
| No operational rows / WhatsApp conversation rows / session rows created | inspected changed files; only validation-config route/service/repository/table/test additions found | PASS |

## Correctness Review
| Area | Finding | Status |
|---|---|---|
| Tenant isolation | Repository explicitly scopes override reads with `.eq("tenant_id", tenantId).eq("tipo", tipo)` and tenant/user context lookup remains tenant-scoped. | PASS |
| Capability gate | Effective capabilities resolver still reuses `whatsapp.channel.access` and supports tenant-scoped role/override checks. | PASS |
| Controlled errors | Controlled JSON body remains consistent; malformed tenant/user IDs now normalize to `TENANT_INVALIDO` before repository access. | PASS |
| Invalid tenant/user identifiers | Route and service each validate UUID shape with passing runtime coverage. Previous CRITICAL finding is fixed. | PASS |
| Response payload | Success body now includes `source` and remains minimal. | PASS |

## Design Coherence Review
| Design decision | Expected | Actual | Status |
|---|---|---|---|
| Response includes `source` | `source: "system_default" | "tenant_override"` | Implemented in response type, service output, and route test | PASS |
| Field metadata support | optional `label`, `ayuda`, `opciones` supported by stored/effective shape | implementation still accepts only `obligatorio` and `tipo` | WARNING |
| Persistence | tenant override table with system defaults fallback | implemented | PASS |
| HMAC + tenant/user headers auth boundary | signed request plus explicit tenant/user headers | implemented | PASS |
| No broad side effects | feature migration should only attach audit trigger | migration now attaches `audit_trigger()` without redefining the shared function | PASS |

## Findings

### CRITICAL
None.

### WARNING
1. **Design merge-shape drift remains for metadata overrides (`label`, `ayuda`, `opciones`).**
   - Evidence: `packages/application/src/validation-config/get-validation-config.ts` only accepts `obligatorio` and `tipo` in field overrides.
   - Impact: implementation is narrower than the current design contract, though not part of the fixed CRITICAL path.
2. **Apply-progress artifact is still missing from openspec.**
   - Evidence: no apply-progress/progress artifact under `openspec/changes/issue-69-validation-config/`.
3. **Schema SQL test still lacks runtime evidence in this environment.**
   - Evidence: `DATABASE_URL_MISSING` prevented executing `supabase/tests/tenant_validation_configs.sql`.
4. **Workspace Prettier check is red, but appears unrelated to issue #69.**
   - Evidence: `pnpm format:check` reports 157 existing formatting warnings across the repo, including many untouched files.

### SUGGESTION
1. If the design still truly requires metadata overrides (`label`, `ayuda`, `opciones`), either implement them in a follow-up or narrow the design/spec so contract and code match.
2. Run `supabase/tests/tenant_validation_configs.sql` against the local disposable database when `DATABASE_URL` is available to convert isolation evidence from static + unit coverage to runtime SQL proof.
3. Persist an apply-progress artifact for this change so verification can reference completed slices directly instead of inferring from code/tests.

## Scope-Creep Check
- No n8n workflow implementation found.
- No WhatsApp conversation/session persistence tables found.
- No operational-record creation code found.
- No new broad scope was introduced by the follow-up fixes.
- Previous migration scope-creep concern (global `audit_trigger()` redefinition) is resolved.

## Final Verdict
**PASS WITH WARNINGS**

The prior CRITICAL defect is fixed: malformed tenant/user identifiers are now rejected as `TENANT_INVALIDO` at both the route and service boundaries, with passing runtime tests. The success payload also now includes `source`, and the migration no longer redefines the shared `audit_trigger()` function. Remaining concerns are limited to non-blocking design drift (`label`/`ayuda`/`opciones` support), missing apply-progress documentation, missing local SQL runtime evidence, and unrelated repo-wide Prettier baseline noise.
