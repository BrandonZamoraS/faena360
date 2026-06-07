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

## Supabase Command Gate (MANDATORY)

- Agents **MUST NOT** run Supabase CLI commands by default, including `supabase db reset`, `supabase test`, migration execution, or SQL test execution.
- If Supabase execution is needed for verification or debugging, the agent must stop and report the exact command, why it is needed, and what result is expected.
- Only run Supabase commands after the user explicitly authorizes that specific command/run.
- If a Supabase-related error appears, investigate files and logs that are already available, then ask via chat instead of retrying commands repeatedly.
- Non-Supabase checks such as `pnpm build`, `pnpm lint`, or `pnpm -r typecheck` may still run when appropriate.

## Questions and Doubts

- Whenever you have questions, doubts, or need extra data about code, documentation, or requirements, you **MUST ask directly via chat**.
- **NEVER** leave your questions, notes, or doubts written as comments inside files (code, markdown, etc.), as this clutters the files and prevents a quick resolution.
