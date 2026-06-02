## Exploration: Monorepo Init — Infraestructura Base

### Current State

El repositorio tiene un único commit (`7e05c6e Initial commit`) con una sola rama (`main`). No existe `.github/` ni workflows.

Existe `faena_frontend/` con una app Next.js 16.2.6 generada por `create-next-app`:
- TypeScript 5 strict mode
- ESLint 9 con `eslint-config-next` (core-web-vitals + typescript)
- TailwindCSS 4 via PostCSS
- Sin test runner, sin formatter
- `pnpm-lock.yaml` y `node_modules/` presentes
- `pnpm-workspace.yaml` existe pero NO es un workspace real — tiene formato incorrecto (solo `allowBuilds`/`ignoredBuiltDependencies`, sin `packages:`)

La página pública (`app/page.tsx`) es el template por defecto de Next.js, NO un placeholder de Faena360.

El directorio `openspec/` ya tiene:
- `config.yaml` con stack, rules y testing config
- `specs/infraestructura-base/spec.md` — spec principal con 6 requirements
- `changes/infraestructura-proyecto-base/proposal.md` — proposal anterior (fue el demo de OpenSpec)
- `changes/monorepo-init/` — recién creado para esta exploration

La spec `infraestructura-base` cubre 6 requirements. Este issue #2 implementa solo los primeros 2 ("Repository foundation" + "Public bootstrap availability"). Los otros 4 requirements dependen de issues posteriores (#4 Supabase, #6 CI/CD).

### Affected Areas

| Path | Impact |
|------|--------|
| `package.json` (root, **nuevo**) | Pnpm workspace root con scripts base (`dev`, `lint`, `format`, `build`, `check`) |
| `pnpm-workspace.yaml` (root, **nuevo**) | Declara `packages: ['apps/*', 'packages/*']` |
| `tsconfig.json` (root, **nuevo**) | Base TypeScript config compartida para packages |
| `faena_frontend/` → `apps/web/` | **Mover** todo el contenido de `faena_frontend/` a `apps/web/` |
| `apps/web/package.json` | Renombrar `name` a `@faena/web`, actualizar scripts |
| `apps/web/tsconfig.json` | Extiende base config del root |
| `apps/web/app/page.tsx` | **Reemplazar** contenido CNA por placeholder Faena360 |
| `apps/web/app/layout.tsx` | Actualizar metadata (title, description → Faena360) |
| `apps/web/README.md` | Reemplazar contenido CNA por docs del proyecto |
| `apps/web/public/` | Limpiar assets default de Next.js (next.svg, vercel.svg, etc.) |
| `packages/domain/` (**nuevo**) | Package vacío con `package.json`, `tsconfig.json` |
| `packages/application/` (**nuevo**) | Package vacío con `package.json`, `tsconfig.json` |
| `packages/shared/` (**nuevo**) | Package vacío con `package.json`, `tsconfig.json` |
| `supabase/` (**nuevo**) | Carpeta para migraciones/config futura |
| `.gitignore` (root) | Agregar ignores para `node_modules`, `.env`, `.next`, `dist` |
| `.prettierrc` / `biome.json` (**nuevo**) | Config de formateo (elección pendiente) |
| `AGENTS.md` | Referencia existente, no se modifica |

### Approaches

1. **Migración directa + pnpm workspaces** — Mover `faena_frontend/` → `apps/web/`, crear root `package.json` con workspaces, packages vacíos, placeholder en page.tsx
   - Pros: Simple, directo, mantiene historial git (git mv)
   - Cons: Packages quedan vacíos (sin barrel exports ni estructura), decisión de formatter pendiente
   - Effort: Medium

2. **Migración con estructura inicial de packages** — Como la opción 1 pero packages incluyen barrel exports (`index.ts`), tsconfigs con paths, y estructura de carpetas inicial (ej: `domain/src/`, `application/src/`)
   - Pros: Deja los packages listos para importar desde el día 1
   - Cons: Más archivos, riesgo de sobre-ingeniería si la estructura cambia después
   - Effort: Medium-High

3. **Creación desde cero (no mover)** — Dejar `faena_frontend/` quieta y crear `apps/web/` como copia
   - Pros: Evita riesgos de mover
   - Cons: Duplica historial, confunde estructura, git no trackea el rename
   - Effort: Medium (descartada — peor que opción 1)

### Recommendation

**Opción 1**: Migración directa con `git mv` + pnpm workspaces.

Razones:
- `faena_frontend/` ya existe y es funcional. Moverlo preserva el historial git.
- Los packages vacíos cumplen el scope del issue #2: "paquetes vacíos o mínimos".
- La estructura de barrel exports y scaffolding interno se define mejor cuando haya código real que los justifique (en issues siguientes).
- Menos riesgo de sobre-ingeniería ahora.

Decisiones pendientes para proposal:
1. **Formatter**: Prettier vs Biome — Biome es más moderno, unifica lint+format, pero ESLint ya está. Recomiendo **Prettier** para coexistir con ESLint sin conflicto, o **Biome** si se quiere reemplazar ESLint también. Esto lo define el proposal.
2. **Branch strategy**: Necesitamos `development`, `stage`, `production` además de `main` para cumplir la spec de ambientes. El issue #6 (CI/CD) depende de esto.
3. **Naming de packages**: `@faena/domain`, `@faena/application`, `@faena/shared` por convención de workspaces.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Formatter decision bloquea** | Medio — sin formatter no se puede verificar `format` script | Decidir en proposal, implementar placeholder si es necesario |
| **`pnpm install` falla tras el rename** | Alto — bloquea build/verify | Probar inmediatamente después del mv + workspace config |
| **Issue #4 (Supabase) depende del dir `supabase/`** | Bajo — es solo crear carpeta vacía | Incluir en este issue |
| **Issue #6 (CI/CD) depende de branches** | Medio — CI/CD necesita branches para PR checks | Crear branches en este issue o documentar que es responsabilidad del issue #6 |
| **`pnpm-workspace.yaml` existente malformado** | Medio — hay un archivo en `faena_frontend/` que hay que sobrescribir | El nuevo root reemplaza la config incorrecta |
| **Sin test runner** | Bajo — out of scope para este issue | Documentar en config.yaml que no hay test runner |

### Ready for Proposal

**Yes**. La exploration está completa. El orchestrator debe:
1. Preguntar al usuario: **Prettier vs Biome** para formateo
2. Preguntar si crear branches (`development`, `stage`, `production`) ahora o delegarlo al issue #6
3. Confirmar el cambio de nombre: `faena_frontend` → `apps/web`
4. Lanzar `sdd-propose` con change name `monorepo-init`

### Dependencies on Other Issues

| Issue | Dependency | Nature |
|-------|------------|--------|
| #4 Supabase | `supabase/` dir, `packages/domain` | Este issue crea los directorios; #4 los llena |
| #6 CI/CD | Branch structure, root scripts | Este issue crea scripts; #6 los usa en workflows |
| #6 CI/CD | `.github/workflows/` | No se crea aquí — es responsabilidad de #6 |
