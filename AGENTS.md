# Instructions for AI Agents

This file provides guidance for AI coding agents (Claude Code, Cursor Agent, Copilot Workspace, Windsurf, etc.) operating on this codebase.

## Before You Begin

1. Check the `.cursor/rules` directory for relevant guidance before starting any task.
2. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and understand the project's conventions.
3. Read the [AI Policy](./AI_POLICY.md) — contributions must comply with it.
4. Familiarize yourself with the [project structure](https://docs.deadlockmods.app/developer-docs/project-structure) and [architecture](https://docs.deadlockmods.app/developer-docs/architecture).

## Project Context

Deadlock Mod Manager is a Tauri + React + TypeScript desktop app for managing mods for Valve's Deadlock game. It's a monorepo managed with pnpm workspaces and Turborepo.

Key directories:

- `apps/desktop` — Tauri desktop app (React frontend + Rust backend)
- `apps/api` — Backend API service (Bun + Hono)
- `apps/bot` — Discord bot application
- `apps/lockdex` — Lockdex service application
- `apps/www` — Web application (Vite + React)
- `apps/docs` — Documentation site (Fumadocs)
- `packages/` — Shared packages (common, database, distributed-lock, logging, queue, shared, vpk-parser, ui)

## Rules for AI Agents

### DO

- Help the human contributor understand code and debug issues
- Suggest improvements that follow existing patterns in the codebase
- Write tests for new and existing functionality
- Use oxfmt for formatting and oxlint for linting (not ESLint/Prettier/Biome)
- Follow the existing commit convention: `type(scope): description` (see [.agents/skills/git-conventions/SKILL.md](.cursor/skills/git-conventions/SKILL.md)); commit on the current branch unless the user asks to use a feature branch
- When creating a requested branch, use a descriptive prefix such as `feature/`, `bugfix/`, or `chore/`; never use `codex/`.
- Respect TypeScript strict mode — never use `any` or `unknown`, use proper types (see 031-never-use-any.mdc)
- Use `react-i18next` for any user-facing strings (check `apps/desktop/src/locales/`)
- Use React Query mutations for async operations, not manual useState loading (see 030-coding-style.mdc)
- When debugging or verifying desktop UI, IPC, or Tauri commands, use **tauri-mcp-server** (see [056-tauri-mcp-debugging.mdc](.cursor/rules/056-tauri-mcp-debugging.mdc)); ask the user to start the dev server — do not start it yourself
- When a plan, design doc, or PR description covers a real call-flow change that a tree would help reviewers understand, optionally include a `npx calldiff@latest diff` (see [095-calldiff.mdc](.cursor/rules/095-calldiff.mdc)). Do not add call-stack diffs to routine chat summaries.

### DON'T

- Generate entire pull requests autonomously
- Open issues based on static analysis without human verification
- Refactor code without prior discussion with maintainers
- Add new dependencies without justification
- Introduce patterns that don't already exist in the codebase without discussion
- Submit code that the human operator cannot explain or modify

### Code Quality Checklist

Before the human submits your work, ensure:

- [ ] `pnpm lint:fix` and `pnpm format:fix` have been run
- [ ] `pnpm check-types` passes
- [ ] Changes are tested (manually at minimum, automated tests preferred)
- [ ] PR description explains _what_ and _why_, not just _how_
- [ ] AI usage is disclosed per the [AI Policy](./AI_POLICY.md)

## Tech Stack Quick Reference

| Layer             | Technology                           |
| ----------------- | ------------------------------------ |
| Desktop Framework | Tauri v2                             |
| Frontend          | React + TypeScript + Tailwind CSS v4 |
| Backend (Desktop) | Rust                                 |
| API Server        | Bun + Hono                           |
| Database          | PostgreSQL + Drizzle ORM             |
| Package Manager   | pnpm (monorepo)                      |
| Build System      | Turborepo                            |
| Linter/Formatter  | oxlint + oxfmt                       |
| i18n              | react-i18next                        |
| Docs              | Fumadocs                             |

## Agent workflows

- Skills live in `.agents/skills`. `pnpm install` links them into `.claude/skills`; rerun `pnpm skills:link` after changing the skill set. Existing directories are preserved.
- For discovery, installation, VPK, or profile changes, read [domain vocabulary](apps/docs/content/docs/developer-docs/domain-model.mdx) and the relevant local architecture docs. For UI work, read `.agents/context/PRODUCT.md` and `.agents/context/DESIGN.md`.
- For Linear or GitHub ticket implementation, use [implement-ticket](.agents/skills/implement-ticket/SKILL.md). For Linear reads and requested updates, use [linear](.agents/skills/linear/SKILL.md).
- For previous decisions or debugging history, use [transcript-search](.agents/skills/transcript-search/SKILL.md), scope results to this checkout, and verify them against current code. Cursor and Claude repository MCP configs register transcripts; use an existing connection when available.
- On request, use [simplify](.agents/skills/simplify/SKILL.md) for scoped review and cleanup or [handoff](.agents/skills/handoff/SKILL.md) to resume elsewhere. For instruction edits, read [writing-for-agents](.agents/skills/writing-for-agents/SKILL.md).
- Run `pnpm check:toolchain` for tooling changes. `pnpm knip` reports unused code/dependencies; review findings before deleting anything, especially generated IPC bindings and external package exports.
- Anti-slop rules initially report warnings so existing code can be inventoried without a bulk refactor. Resolve findings in new or modified code; promote rules only after reviewing their existing violations.
- Testing and import guidance: `057-testing.mdc` and `032-import-rules.mdc`. Preserve each package's existing Bun test conventions.
