# Instructions for AI Agents

This file provides guidance for AI coding agents (Claude Code, Cursor Agent, Copilot Workspace, Windsurf, etc.) operating on this codebase.

## Before You Begin

1. Follow this file and read the task-specific guidance linked below before changing the affected code. Project guidance lives in `.agents/context/` and `.agents/skills/`.
2. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and understand the project's conventions.
3. Read the [AI Policy](./AI_POLICY.md) — contributions must comply with it.
4. Familiarize yourself with the local [project structure](apps/docs/content/docs/developer-docs/project-structure.mdx) and [architecture](apps/docs/content/docs/developer-docs/architecture.mdx). Setup instructions live in `CONTRIBUTING.md`; root and package scripts are authoritative for commands.

## Project Context

Deadlock Mod Manager is a Tauri + React + TypeScript desktop app for managing mods for Valve's Deadlock game. It's a monorepo managed with pnpm workspaces and Turborepo.

Key directories:

- `apps/desktop` — Tauri desktop app (React frontend + Rust backend)
- `apps/api` — Backend API service and workers (Bun + Hono)
- `apps/auth` — Authentication service (Better Auth + OIDC)
- `apps/mirror-service` — S3-backed download mirror for mod files
- `apps/bot` — Discord bot application
- `apps/lockdex` — Lockdex service application
- `apps/dmodpkg` — CLI for `.dmodpkg` mod packages
- `apps/www` — Web application (Vite + React)
- `apps/docs` — Documentation site (Fumadocs)
- `packages/` — Shared packages. TypeScript: common, crosshair, database, distributed-lock, feature-flags, instrumentation, logging, perf-catalog, queue, relay-client, shared, ui. Rust, some exposed through Bun FFI: deadlock-discord-presence, deadlock-match-sync (match salts through Steam, behind desktop's `match-sync` feature), dmodpkg, dmp-parser (crash minidumps), hero-parser, kv-parser, source2-model, vpk-parser, vpkmanager
- `tools/` — Shared TypeScript, oxc, and custom oxlint plugin configs

## Rules for AI Agents

### DO

- Help the human contributor understand code and debug issues
- Suggest improvements that follow existing patterns in the codebase
- Write tests for new and existing functionality
- Use oxfmt for formatting and oxlint for linting (not ESLint/Prettier/Biome)
- Follow the existing commit convention: `type(scope): description` (see [.agents/skills/git-conventions/SKILL.md](.agents/skills/git-conventions/SKILL.md)); commit on the current branch unless the user asks to use a feature branch
- When creating a requested branch, use a descriptive prefix such as `feature/`, `bugfix/`, or `chore/`; never use `codex/`.
- Respect TypeScript strict mode — never use `any`, `unknown`, or type assertions (`as` or angle-bracket casts). Use explicit types, generics, type guards, and narrowing.
- Use static imports at the top of files. Import across workspaces through package names and public exports; use existing relative imports or aliases within a package. Packages must not depend on app internals or bypass generated binding boundaries.
- Throw `BaseError` subclasses from `@deadlock-mods/common` in TypeScript application and library code. Tests and generated UI context invariants may keep raw `Error`; see [error handling](.agents/context/ERROR-HANDLING.md) when adding or changing errors.
- Use Rust edition 2024 across Rust crates; verify Rust changes with appropriate `cargo check`, tests, and `cargo clippy`.
- Use the initialized structured logger instead of `console.*`; follow [logging-best-practices](.agents/skills/logging-best-practices/SKILL.md) when adding or changing logging.
- Write comments for non-obvious decisions, business rules, algorithms, and public API contracts. Validate external data, user input, and destructive operations; trust typed internal contracts and let programming errors surface. Catch errors when recovery or useful context is possible.
- Use `react-i18next` for any user-facing strings (check `apps/desktop/src/locales/`)
- Use React Query mutations for async operations, not manual useState loading
- Keep React files focused on one component or responsibility. Extract substantial child components with their owning types, hooks, and helpers; avoid nested component definitions. Follow [split-react-components](.agents/skills/split-react-components/SKILL.md) when a file accumulates multiple components, preserving state ownership and behavior.
- When debugging or verifying desktop UI, IPC, or Tauri commands, use **tauri-mcp-server** through [verify-desktop](.agents/skills/verify-desktop/SKILL.md); ask the user to start the dev server — do not start it yourself
- When a plan, design doc, or PR description covers a real call-flow change that a tree would help reviewers understand, optionally use [calldiff](.agents/skills/calldiff/SKILL.md). Do not add call-stack diffs to routine chat summaries.
- Create a changeset for user-visible features, fixes, breaking changes, security fixes, and notable performance improvements; follow [changeset](.agents/skills/changeset/SKILL.md). Skip documentation, formatting, internal tooling, and changes without user impact.

### DON'T

- Generate entire pull requests autonomously
- Open issues based on static analysis without human verification
- Refactor code without prior discussion with maintainers
- Add new dependencies without justification
- Introduce patterns that don't already exist in the codebase without discussion
- Submit code that the human operator cannot explain or modify
- Proactively create documentation or markdown wrap-up files after completing unrelated tasks

Keep replies concise and professional, without emojis, unnecessary affirmations, or explanations of obvious points.

### Code Quality Checklist

Before the human submits your work, ensure:

- [ ] `pnpm lint:fix` and `pnpm format:fix` have been run
- [ ] `pnpm check-types` passes
- [ ] Changes are tested (manually at minimum, automated tests preferred)
- [ ] PR description explains _what_ and _why_, not just _how_
- [ ] AI usage is disclosed per the [AI Policy](./AI_POLICY.md)

Test observable behavior and failure cases for functional changes; follow each package's existing test layout and naming. Documentation-only changes do not need new tests. Suggest updates to shared guidance when the task reveals a missing convention.

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

## Commands

Run from the repo root. Script names are in the root and per-package `package.json`.

- Single test: `bun test <path>` or `pnpm --filter @deadlock-mods/<package> test`. `packages/shared` uses Vitest; the rest use `bun:test`. Run the smallest relevant suite.
- Rust tests: `cargo test` from `apps/desktop` (the Cargo workspace root; the crate is `src-tauri`). Match sync's engine tests run from `packages/deadlock-match-sync`. Pre-commit (lefthook) runs `cargo clippy --all-targets` on Rust changes in `apps/desktop`, `packages/deadlock-match-sync`, `packages/dmodpkg`, and `packages/vpk-parser`.
- Production tsconfigs can exclude tests, so a passing production type check doesn't cover them. Desktop `check-types` also runs `tsconfig.tests.json`; other packages may need a dedicated test tsconfig.
- After CEF builds (`dev:cef`, `build:cef*`), run `pnpm --filter desktop cef:cleanup` to restore the default Wry build.
- API and database scripts read the root `.env` (template: `env.example`).

## Desktop architecture

Read the [domain model](apps/docs/content/docs/developer-docs/domain-model.mdx) before touching discovery, downloads, installation, or profiles.

Tauri dependencies and APIs must stay on v2. Before changing desktop dependencies, configuration, or capabilities, read [Tauri conventions](.agents/context/TAURI.md).

- **Rust owns local game files.** Commands live in `apps/desktop/src-tauri/src/commands/` and are registered in `invoke_handler` in `src-tauri/src/lib.rs`. Install and VPK logic lives in `src-tauri/src/mod_manager/`.
- **Generated IPC types.** Rust structs derive `ts-rs` and export to `apps/desktop/src/types/generated/`. After changing an exported Rust type, run `pnpm --filter desktop generate-types` instead of editing the generated files.
- **Frontend state.** UI state is a persisted Zustand store built from slices in `apps/desktop/src/lib/store/`. Changing the persisted shape needs a migration in `migrate.ts`, and `merge.ts` lists the deep-merge keys.
- **Remote data.** `apps/desktop/src/lib/api-client.ts` calls the API (`VITE_API_URL`, default `https://api.deadlockmods.app`) through React Query. Some GameBanana catalog reads go direct (`gamebanana-catalog`). DTOs shared with the API come from `@deadlock-mods/shared`.
- For a change that spans layers, trace the DTO, the IPC command, the file operation, and persistence together.

## Agent workflows

- Parallel tasks may use separate worktrees or share a checkout, following the user's preference. In a shared checkout, assign file or hunk ownership and coordinate overlapping edits; unrelated work continues in parallel.
- For commits, integration, conflict resolution, or recovery, follow the [shared-work and recovery safeguards](.agents/skills/git-conventions/SKILL.md#parallel-work-and-recovery). Preserve other tasks' edits and verify the resulting code before declaring work already merged.
- Skills live in `.agents/skills`. `pnpm install` links them into `.claude/skills`; rerun `pnpm skills:link` after changing the skill set. Existing directories are preserved.
- For TypeScript, JavaScript, React, or backend code changes, read [coding conventions](.agents/context/CODING.md). When editing errors, also read [error handling](.agents/context/ERROR-HANDLING.md).
- For discovery, installation, VPK, or profile changes, read [domain vocabulary](apps/docs/content/docs/developer-docs/domain-model.mdx) and the relevant local architecture docs. For UI work, read `.agents/context/PRODUCT.md` and `.agents/context/DESIGN.md`.
- For Linear or GitHub ticket implementation, use [implement-ticket](.agents/skills/implement-ticket/SKILL.md). For Linear reads and requested updates, use [linear](.agents/skills/linear/SKILL.md).
- For previous decisions or debugging history, use [transcript-search](.agents/skills/transcript-search/SKILL.md), scope results to this checkout, and verify them against current code. Cursor and Claude repository MCP configs register transcripts; use an existing connection when available.
- On request, use [simplify](.agents/skills/simplify/SKILL.md) for scoped review and cleanup or [handoff](.agents/skills/handoff/SKILL.md) to resume elsewhere. For instruction edits, read [writing-for-agents](.agents/skills/writing-for-agents/SKILL.md).
- Run `pnpm check:toolchain` for tooling changes. `pnpm knip` reports unused code/dependencies; review findings before deleting anything, especially generated IPC bindings and external package exports.
- Anti-slop rules initially report warnings so existing code can be inventoried without a bulk refactor. Resolve findings in new or modified code; promote rules only after reviewing their existing violations.
- Maintain shared instructions here, detailed reference material in `.agents/context/`, and workflows in `.agents/skills/`. Keep each requirement in one authoritative home and update its callers when moving it. `CLAUDE.md` imports this file.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.

<!-- END:turborepo-agent-rules -->
