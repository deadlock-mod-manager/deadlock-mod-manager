# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read [AGENTS.md](AGENTS.md) before working. It is the source of truth for all agents: conventions, links to the Cursor rules in `.cursor/rules`, project context, and agent workflows. Canonical skills live in `.agents/skills`; `pnpm skills:link` exposes them to Claude Code. This file adds only what AGENTS.md leaves out.

## Commands

Run from the repo root. Script names are in the root and per-package `package.json`.

- Verify: `pnpm lint:fix`, `pnpm format:fix`, `pnpm check-types`. Pre-commit (lefthook) also runs `cargo clippy --all-targets` on Rust changes in `apps/desktop`, `packages/dmodpkg`, and `packages/vpk-parser`.
- Single test: `bun test <path>` or `pnpm --filter @deadlock-mods/<package> test`. `packages/shared` uses Vitest; the rest use `bun:test`. Run the smallest relevant suite.
- Rust tests: `cargo test` from `apps/desktop` (the Cargo workspace root; the crate is `src-tauri`).
- Test type-checking: production tsconfigs can exclude tests, so a passing production type check doesn't cover them. Desktop `check-types` also runs `tsconfig.tests.json`. Other packages may need a dedicated test tsconfig.
- Desktop dev: the user runs `pnpm --filter desktop dev`. Verify live behavior with tauri-mcp-server, see [056-tauri-mcp-debugging.mdc](.cursor/rules/056-tauri-mcp-debugging.mdc).
- After CEF builds (`dev:cef`, `build:cef*`), run `pnpm --filter desktop cef:cleanup` to restore the default Wry build.
- API and database scripts read the root `.env` (template: `env.example`).

## Desktop architecture

Ownership boundaries and vocabulary (submission, mod, download, VPK, profile, manifest) are in the [domain model](apps/docs/content/docs/developer-docs/domain-model.mdx). Read it before touching discovery, downloads, installation, or profiles.

- **Rust owns local game files.** Commands live in `apps/desktop/src-tauri/src/commands/` and are registered in `invoke_handler` in `src-tauri/src/lib.rs`. Install and VPK logic lives in `src-tauri/src/mod_manager/`.
- **Generated IPC types.** Rust structs derive `ts-rs` and export to `apps/desktop/src/types/generated/`. After changing an exported Rust type, run `pnpm --filter desktop generate-types` instead of editing the generated files.
- **Frontend state.** UI state is a persisted Zustand store built from slices in `apps/desktop/src/lib/store/`. Changing the persisted shape needs a migration in `migrate.ts`, and `merge.ts` lists the deep-merge keys.
- **Remote data.** `apps/desktop/src/lib/api-client.ts` calls the API (`VITE_API_URL`, default `https://api.deadlockmods.app`) through React Query. Some GameBanana catalog reads go direct (`gamebanana-catalog`). DTOs shared with the API come from `@deadlock-mods/shared`.
- For a change that spans layers, trace the DTO, the IPC command, the file operation, and persistence together.
