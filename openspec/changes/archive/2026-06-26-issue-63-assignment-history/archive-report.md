# Archive Report: Consultar Asignaciones Activas e Historial por Rol

**Change**: issue-63-assignment-history
**Issue**: [#63](https://github.com/BrandonZamoraS/faena360/issues/63)
**PR**: [#88](https://github.com/BrandonZamoraS/faena360/pull/88)
**Branch**: `feat/63-assignment-history-consolidated`
**Base**: `development`
**Date**: 2026-06-26
**Status**: ✅ Complete, Verified, Ready for Merge

---

## Summary

Implementación completa del issue #63: consulta de asignaciones activas de maquinaria con filtros por proyecto/máquina, y visualización de historial de cambios (estado y tarifa) por asignación. Acceso de lectura para admin y supervisor, con modo solo lectura para supervisor.

### Tamaño final
- **24/24 tareas completadas**
- **376 tests pasan, 0 regresiones**
- **~600 líneas cambiadas** (incluyendo tests SQL con seed data)
- **4 fases** implementadas en batches

---

## Artifacts

| Artifact | Location | Status |
|----------|----------|--------|
| Proposal | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/proposal.md` | ✅ Archived |
| Spec | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/spec.md` | ✅ Archived |
| Design | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/design.md` | ✅ Archived |
| Tasks | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/tasks.md` | ✅ Archived |
| Verify Report | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/verify-report.md` | ✅ Archived |
| Archive Report | `openspec/changes/archive/2026-06-26-issue-63-assignment-history/archive-report.md` | ✅ This file |

---

## Verification Result

**Verdict**: ✅ **PASS** (after fix)

| Check | Initial | Post-Fix |
|-------|---------|----------|
| `pnpm -r typecheck` | ✅ | ✅ |
| `pnpm lint` | ✅ | ✅ |
| `pnpm test` | ✅ 376 passed | ✅ 376 passed |
| `pnpm build` (Next.js) | ❌ CRITICAL | ✅ **Fixed** |

### CRITICAL Fix Applied

**Issue**: `history-drawer.tsx` (Client Component) importaba `listAssignmentHistoryAction` desde `catalog.ts`, que mezclaba inline Server Actions con APIs de servidor (`next/headers`, `next/cache`). Next.js 16 + Turbopack rompía el build.

**Fix**: Se extrajeron las server actions a un archivo dedicado `actions.ts` con `"use server"` al tope. `catalog.ts` quedó como módulo de utilidades sin server-only imports. Los imports se actualizaron en `history-drawer.tsx` y `page.tsx`.

**Verification**: Build de Next.js exitoso tras el fix.

---

## Files Changed

### Database
- `supabase/migrations/20260627000002_assignment_history.sql` — Trigger modificado, índices, RPCs extendidos/nuevos

### Domain
- `packages/domain/src/assignments/machine-assignment.ts` — `AssignmentHistoryEntry`, `MachineAssignmentHistoryFilters`, port extendido

### Application
- `packages/application/src/assignments/machine-assignment.ts` — `listAssignmentHistory()` con capability guard
- `packages/application/src/assignments/machine-assignment.test.ts` — 4 unit tests nuevos

### Infrastructure
- `packages/infrastructure/src/assignments/SupabaseMachineAssignmentRepository.ts` — `listHistory()`, `listActive()` extendido

### Web
- `apps/web/app/dashboard/assignments/page.tsx` — Filtros, drawer, modo solo lectura
- `apps/web/app/dashboard/assignments/filters.tsx` — Dropdowns de filtro (nuevo)
- `apps/web/app/dashboard/assignments/history-drawer.tsx` — Drawer de timeline (nuevo)
- `apps/web/app/dashboard/assignments/actions.ts` — Server actions (nuevo, post-fix)
- `apps/web/app/dashboard/assignments/catalog.ts` — Utilidades (modificado, post-fix)
- `apps/web/app/dashboard/assignments/page.runtime.test.tsx` — 4 runtime tests nuevos

### SQL Tests
- `supabase/tests/asignaciones_maquina_catalog.sql` — 7 tests SQL nuevos

---

## Deviations from Design

| Decisión | Diseño | Implementación | Razón |
|----------|--------|----------------|-------|
| Drawer nativo `<dialog>` | `<dialog>` nativo | State-controlled overlay | Más limpio para lazy-load y manejo de errores |
| Filtros en URL | `searchParams` | `<form method="get">` con script inline | Compatibilidad con `renderToStaticMarkup` en tests |
| Actor en timeline | UUID truncado | UUID truncado | Lookup de nombre requeriría otra llamada RPC — fuera de scope |
| Server actions | En `catalog.ts` | Archivo dedicado `actions.ts` | Fix de CRITICAL: separar server actions de imports de servidor |

---

## Lessons Learned

1. **Next.js App Router + Server Actions**: Nunca importar server actions desde un archivo que también importa `next/headers`, `next/cache`, etc. Si un Client Component necesita una server action, debe estar en un archivo dedicado con `"use server"`.

2. **Stacked PRs**: La estrategia de 4 PRs encadenados funcionó bien para organizar el trabajo, pero el usuario final prefirió un PR consolidado. Para cambios medianos (~600 líneas), un solo PR con commits atómicos puede ser más simple.

3. **Windows + Prettier**: El ruido de line endings (CRLF/LF) dificulta `pnpm format:check`. Recomendación: agregar `endOfLine: "auto"` a `.prettierrc`.

4. **Verify antes de merge**: El verify report atrapó un CRITICAL que los tests unitarios no detectaron. Siempre correr `pnpm build` además de `pnpm test`.

---

## Next Steps

1. **Merge PR #88** a `development`
2. **Revisar checks del PR** (typecheck, lint, test, build)
3. **QA manual** según criterios del issue:
   - Como admin, consultar asignaciones activas y abrir historial
   - Como supervisor, confirmar modo solo lectura
   - Verificar historial refleja cambio de estado/tarifa
   - Confirmar asignación de otro tenant no es visible

---

## SDD Workflow Summary

| Fase | Estado | Artifacts |
|------|--------|-----------|
| Exploration | ✅ Complete | Engram `sdd/issue-63-assignment-history/explore` |
| Proposal | ✅ Complete | `proposal.md`, Engram `sdd/issue-63-assignment-history/proposal` |
| Spec | ✅ Complete | `spec.md`, Engram `sdd/issue-63-assignment-history/spec` |
| Design | ✅ Complete | `design.md`, Engram `sdd/issue-63-assignment-history/design` |
| Tasks | ✅ Complete | `tasks.md`, Engram `sdd/issue-63-assignment-history/tasks` |
| Apply | ✅ Complete | Engram `sdd/issue-63-assignment-history/apply-progress` |
| Verify | ✅ Complete (post-fix) | `verify-report.md`, Engram `sdd/issue-63-assignment-history/verify-report` |
| Archive | ✅ Complete | `archive-report.md`, Engram `sdd/issue-63-assignment-history/archive-report` |
