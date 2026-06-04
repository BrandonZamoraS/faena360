# Design: Monorepo Init

## Technical Approach

Relocate `faena_frontend/` to `apps/web/` via `git mv`, scaffold three typed packages under `packages/`, add root workspace config, rename `main`→`production`, create `development`/`stage`, and replace the CNA landing page with a placeholder. Verify with `pnpm dev`, `pnpm lint`, `pnpm format --check`, `tsc --noEmit`.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Workspace | pnpm workspaces | Existing tool; `apps/*` + `packages/*` pattern |
| Package refs | `workspace:*` | Native pnpm, enforces boundaries |
| Shared TS | Root `tsconfig.json` | Single strict base; packages extend |
| Formatter + Linter | Prettier + `eslint-config-prettier` | Prettier owns style; ESLint owns quality |
| Default branch | `production` | Required by spec for env-safe delivery |

## File Structure

```
faena360/
├── apps/
│   └── web/                    ← git mv faena_frontend
│       ├── app/
│       │   └── page.tsx        ← placeholder
│       ├── package.json        ← @faena360/web
│       ├── tsconfig.json       ← extends root
│       └── eslint.config.mjs   ← + prettier
├── packages/
│   ├── domain/
│   │   ├── package.json        ← @faena360/domain
│   │   └── tsconfig.json
│   ├── application/
│   │   ├── package.json        ← @faena360/application
│   │   └── tsconfig.json
│   └── shared/
│       ├── package.json        ← @faena360/shared
│       └── tsconfig.json
├── supabase/                   ← empty placeholder
├── package.json                ← root workspace
├── pnpm-workspace.yaml
├── tsconfig.json               ← shared base
├── .prettierrc
└── .gitignore                  ← expanded
```

## File Contents

### `/package.json`

```json
{
  "name": "faena360",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "pnpm format:check && pnpm lint && pnpm -r typecheck"
  },
  "devDependencies": {
    "prettier": "^3",
    "typescript": "^5"
  }
}
```

### `/pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", "dist", "build", ".next"]
}
```

### `packages/{domain,application,shared}/package.json`

```json
{
  "name": "@faena360/domain",
  "version": "0.1.0",
  "private": true,
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5" }
}
```

*(Application/Shared identical except `name`.)*

### `packages/{domain,application,shared}/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

### `apps/web/package.json` adjustments

Modify existing `faena_frontend/package.json`:
- Change `"name"` to `"@faena360/web"`
- Add `"typecheck": "tsc --noEmit"` to `scripts`
- Add `"eslint-config-prettier": "^9"` to `devDependencies`
- Add workspace dependencies:
  - `"@faena360/domain": "workspace:*"`
  - `"@faena360/application": "workspace:*"`
  - `"@faena360/shared": "workspace:*"`

### `apps/web/tsconfig.json` adjustments

Prepend `"extends": "../../tsconfig.json"` at the top; preserve all existing Next.js-specific fields (plugins, paths, incremental, include/exclude).

### `apps/web/eslint.config.mjs`

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

### `/.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80
}
```

### `/.gitignore` additions

Append to existing root `.gitignore`:

```
# Dependencies
node_modules/
.pnpm-debug.log*

# Build outputs
dist/
build/
.next/
out/

# Environment
.env*
!.env.example

# IDE
.idea/
.vscode/

# OS
.DS_Store

# TypeScript
*.tsbuildinfo

# Coverage
coverage/
```

### `apps/web/app/page.tsx`

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Faena360</h1>
      <p className="mt-4 text-lg text-gray-600">
        Plataforma no operativa
      </p>
    </main>
  );
}
```

## Branch Strategy

Safe rename sequence (coordinate with team):

```bash
git checkout main
git pull origin main
git branch -m main production
git push -u origin production
# Set production as default branch in GitHub settings, then:
git push origin --delete main
git checkout -b development production && git push -u origin development
git checkout -b stage production && git push -u origin stage
```

## Work-Unit Commit Plan

1. `chore(repo): rename main to production and create development/stage branches`
2. `chore(repo): move faena_frontend to apps/web preserving git history`
3. `chore(workspace): add root package.json, pnpm-workspace.yaml, and shared tsconfig`
4. `chore(packages): scaffold domain, application, and shared packages`
5. `chore(tooling): add prettier config, eslint-prettier compat, and expand gitignore`
6. `chore(apps/web): rename package, add workspace deps, and adjust tsconfig`
7. `feat(apps/web): replace landing page with system not operational placeholder`

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Integration | Workspace commands | `pnpm dev`, `pnpm lint`, `pnpm format --check`, `tsc --noEmit` |
| E2E | Placeholder page | HTTP 200 + "Plataforma no operativa" |

## Migration / Rollout

No data migration. Branch rename requires team coordination. Rollback: reverse `git mv`, delete new files, restore `.gitignore`, rename branch back.

## Open Questions

- [ ] Switch GitHub default branch to `production` before deleting `main`?
- [ ] Add `@faena360/*` workspace deps to `apps/web/package.json` now or when packages export?
- [ ] Add `prettier-plugin-tailwindcss` for Tailwind 4 class sorting?
