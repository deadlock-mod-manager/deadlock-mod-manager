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
- Follow the existing commit convention: `type(scope): description` (see 100-git-conventions.mdc); commit on the current branch unless the user asks to use a feature branch
- Respect TypeScript strict mode — never use `any` or `unknown`, use proper types (see 031-never-use-any.mdc)
- Use `react-i18next` for any user-facing strings (check `apps/desktop/src/locales/`)
- Use React Query mutations for async operations, not manual useState loading (see 030-coding-style.mdc)

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
