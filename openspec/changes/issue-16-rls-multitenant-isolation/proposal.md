# Proposal: feat(auth): configurar RLS y aislamiento multitenant

## Intent

Cerrar la brecha entre el esquema auth actual y el modelo multitenant esperado: hoy las tablas de autorización no tienen RLS y `audit_log` no puede aislarse por tenant de forma confiable.

## Scope

### In Scope
- Agregar migración nueva para helper `current_app_tenant_id()`, `ENABLE RLS` y políticas por tenant en tablas auth.
- Agregar `tenant_id` a `audit_log` y, por recomendación, también a `user_capability_overrides`.
- Definir artefactos SQL de validación para escenarios cross-tenant y documentar dependencia del claim JWT `app_metadata.tenant_id`.

### Out of Scope
- Poblar el claim JWT desde frontend/backend (Issue 3).
- Triggers de co-tenancy o rediseño de joins para duplicar `tenant_id` en `user_roles` / `role_capabilities`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `authorization-base`: agregar aislamiento RLS tenant-aware para tablas de autorización, exigir `tenant_id` en `audit_log`, y bloquear hard delete funcional de `user_profiles`.

## Approach

Usar enfoque híbrido: políticas directas con `tenant_id = current_app_tenant_id()` en `user_profiles`, `roles`, `user_capability_overrides` y `audit_log`; políticas con joins solo en `user_roles` y `role_capabilities`. Recomiendo política DELETE explícita (`FOR DELETE USING (false)`) en `user_profiles`: no agrega más fuerza que default deny, pero deja la intención visible y auditable.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/20250606000000_rls_multitenant_isolation.sql` | New | Helper, ALTER TABLE, enable RLS, policies |
| `openspec/specs/authorization-base/spec.md` | Modified | Requisitos RLS y aislamiento auth |
| `supabase/tests/rls_multitenant_isolation.sql` | New | Validación SQL por tenant/JWT simulado |
| `supabase/docs/tenant-isolation-strategy.md` | Modified | Contrato de tenant_id y bypass service role |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Claim JWT faltante/malformado | Med | Helper defensivo y documentación de dependencia con Issue 3 |
| Bypass por service role | Med | Documentar que RLS no reemplaza controles backend |
| Desalineación con datos existentes | Low | Backfill/migration guard antes de `SET NOT NULL` si aplica |

## Rollback Plan

Revertir la nueva migración: drop policies/helper, disable RLS en tablas afectadas y remover columnas nuevas solo si no contienen datos necesarios.

## Dependencies

- Issue 3 debe poblar `app_metadata.tenant_id` para validación end-to-end.
- Entorno Supabase/Postgres para ejecutar pruebas SQL manuales o `psql`.

## Success Criteria

- [ ] Las tablas auth quedan aisladas por tenant con RLS verificable a nivel SQL.
- [ ] `audit_log` conserva aislamiento correcto aun si `actor_user_id` o `target_user_id` quedan en `NULL`.
- [ ] Existe evidencia reproducible de pruebas cross-tenant sin requerir test runner JS.
