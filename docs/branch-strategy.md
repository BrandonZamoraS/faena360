# Branch Strategy

## Overview

Faena360 uses a four-stage branching model to isolate work-in-progress from stable environments.

## Flow

```
feature/*  ──►  development  ──►  stage  ──►  production
```

| Branch        | Purpose                              | Deploy Target                |
| ------------- | ------------------------------------ | ---------------------------- |
| `feature/*`   | Active development, spikes, bugfixes | None (local + CI validation) |
| `development` | Integration branch for ongoing work  | None (CI only)               |
| `stage`       | Pre-production validation, QA, demos | Staging environment          |
| `production`  | Live, user-facing release            | Production environment       |

## Rules

1. All new work starts from `development` as a `feature/*` branch.
2. Open pull requests to `development` for code review and CI checks.
3. Once `development` is stable, merge it into `stage` to trigger a staging deploy.
4. Once staging is validated, merge `stage` into `production` to trigger a production deploy.
5. Never push secrets or environment-specific credentials in source code.
6. Critical environment variables are validated during build; a missing variable blocks deploy.
