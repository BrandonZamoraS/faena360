# Faena360 Agent Instructions

## Project Skills

- Use `skills/obsidian-vault-navigator/SKILL.md` before reading notes from `obsidian-vault/`.
- Use `~/.agents/skills/emilkowal-animations/SKILL.md` for animation guidance (Emil Kowalski principles).
- Use `~/.agents/skills/impeccable/SKILL.md` for design critiques and avoiding anti-patterns.

## Faena360 Documentation Source of Truth

- Do not invent product, functional, architecture, API, database, QA, Jira, release, or decision documentation.
- When you need Faena360 context, use the Obsidian vault and treat the system statement as the source of truth.
- Before answering or changing documentation based on product reality, read `obsidian-vault/01-producto/enunciado-sistema/00-indice-enunciado.md` and use it to choose the relevant enunciado parts.
- If the required information is not found in the enunciado after checking the relevant parts, ask the user for clarification instead of guessing.
- If a derived note conflicts with the enunciado, say so and prefer the enunciado unless the user explicitly records a new decision.

## Delegation and Parallelization (MANDATORY)

When an agent faces a large subtask (reading/writing many files, refactoring multiple modules, etc.), it MUST:
1. Divide the work into independent subtasks
2. Launch multiple sub-agents in parallel whenever possible
3. Never do everything sequentially if tasks are independent

When an agent has several unrelated tasks:
- Create 2+ separate agents in parallel
- Wait for them to finish and consolidate results

This applies to reading 4+ files, multi-file edits, test execution, or any task that can be divided.

## SDD Intent Check (MANDATORY)

- Before executing any GitHub issue, product change, feature, bugfix, or implementation request, the agent **MUST ask whether the work should use SDD** unless the user explicitly says it is or is not SDD.
- Do not infer that a regular implementation workflow is acceptable just because the request does not mention SDD.
- If the user says to use SDD, start with the project's SDD workflow before changing code.
- If the user says not to use SDD, proceed with the normal isolated worktree + delegation + verification workflow when appropriate.

## Questions and Doubts

- Whenever you have questions, doubts, or need extra data about code, documentation, or requirements, you **MUST ask directly via chat**.
- **NEVER** leave your questions, notes, or doubts written as comments inside files (code, markdown, etc.), as this clutters the files and prevents a quick resolution.

## GitHub Operations

- Always use the GitHub MCP server for GitHub operations (issues, labels, pull requests, reviews, checks, releases) instead of shelling out to `gh` or guessing from local state.
- If the GitHub MCP server is unavailable because Docker Desktop is not running, try to start Docker Desktop and retry the MCP operation.
- If Docker Desktop cannot be started from the agent environment, tell the user immediately and ask them to start Docker Desktop manually before continuing GitHub work.
- After creating or updating a PR, always check the PR checks through GitHub MCP.
- If checks are still queued or in progress, wait 90 seconds and check them again before reporting status.
- If any check fails, inspect the failing check details/logs, identify the root cause, and either fix it or report the exact blocker with evidence.

## SQL Verification

- The local database is temporary/non-critical for this project. Agents may use it as a disposable test database.
- When database facts are needed, agents should run the local database commands needed to start, clean, update, reset, migrate, seed, query, or verify the database instead of guessing or relying only on docs.
- Agents may run destructive local database commands (for example reset/clean/reseed) when needed for verification, as long as the target is the local development database.
- Do not run destructive commands against remote, production, staging, or shared databases unless the user explicitly authorizes that exact target.
