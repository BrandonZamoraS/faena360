---
name: obsidian-vault-navigator
description: "Trigger: Obsidian vault, obsidian-vault, notas del vault, buscar documentación Faena360. Use when selecting which vault notes to read."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

# Obsidian Vault Navigator

## Activation Contract

Use this skill before reading notes from `obsidian-vault/` for product, architecture, API, database, QA, Jira, release, or decision context in Faena360.

## Hard Rules

- Do not read random notes first.
- Do not invent Faena360 documentation, behavior, rules, roles, states, architecture, API contracts, database rules, QA criteria, Jira scope, release notes, or decisions.
- The enunciado is the source of truth for product reality. When the task needs Faena360 context, read `obsidian-vault/01-producto/enunciado-sistema/00-indice-enunciado.md` and use it to select the relevant enunciado parts before relying on derived notes.
- If the needed information is not found in the relevant enunciado parts, ask the user for clarification. Never fill gaps with assumptions.
- If a derived vault note conflicts with the enunciado, state the conflict and prefer the enunciado unless the user explicitly records a new decision.
- Start at `obsidian-vault/estructura-vault.md` to understand the map.
- For every candidate folder, read the folder index note before reading child notes.
- The folder index note is the `.md` file named like the folder, for example `01-producto/01-producto.md` or `05-arquitectura/05-arquitectura.md`.
- If the folder index is empty or missing, use `estructura-vault.md` plus filenames as a fallback and say the index was empty or missing.
- Prefer the narrowest relevant note; do not bulk-read a whole folder unless the task explicitly needs broad discovery.

## Decision Gates

| Need | First target |
| --- | --- |
| Current scope, active rules, glossary, live decisions | `00-current/00-current.md` |
| Product behavior, users, roles, scope | `01-producto/01-producto.md` |
| Roadmap or phase boundaries | `02-fases/02-fases.md` |
| Module-specific rules or flows | `03-modulos/03-modulos.md` |
| Detailed functional specs | `04-specs/04-specs.md` |
| Frontend, backend, database architecture | `05-arquitectura/05-arquitectura.md` |
| API endpoints/contracts | `06-api/06-api.md` |
| Schema, migrations, persistence | `07-database/07-database.md` |
| WhatsApp or n8n automation | `08-whatsapp-n8n/08-whatsapp-n8n.md` |
| QA, tests, acceptance criteria | `09-qa/09-qa.md` |
| Jira/task management | `10-jira(o similar)/10-jira.md` |
| Architectural decisions | `11-decisions-adr/11-decisions-adr.md` |
| Releases/changelog | `12-releases/12-releases.md` |

## Execution Steps

1. Read `obsidian-vault/estructura-vault.md`.
2. Read `obsidian-vault/01-producto/enunciado-sistema/00-indice-enunciado.md` whenever the task needs Faena360 context, product reality, or documentation changes based on the enunciado.
3. Use the enunciado index to choose the relevant enunciado parts and read those parts first.
4. Pick 1-3 candidate folders from the vault map based on the user question.
5. Read each candidate folder index note named like its folder.
6. Use the index descriptions to choose the smallest set of child notes.
7. Read only those child notes.
8. If the answer is still not present in the enunciado or relevant notes, ask the user. Do not infer missing rules.
9. Answer with the exact notes used and mention any skipped candidate folder when its index showed it was irrelevant.

## Output Contract

When using vault knowledge, include a short source line:

`Fuentes vault: obsidian-vault/<folder>/<note>.md, ...`

## References

- `obsidian-vault/estructura-vault.md` — top-level vault map.
- `obsidian-vault/01-producto/enunciado-sistema/00-indice-enunciado.md` — source-of-truth map for the system statement.
