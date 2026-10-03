---
name: simplify
description: Simplify a selected diff with parallel read-only reviews of quality, performance, and reuse, then apply focused fixes.
disable-model-invocation: true
---

# Simplify

1. Use the user-selected paths or diff. Otherwise inspect staged and unstaged changes and separate the current task from pre-existing work. State the scope before reviewing.
2. Dispatch three read-only reviewers with that scope: code quality, performance, and reuse. Give each the relevant project rules and acceptance criteria. Reviewers report evidence and concrete fixes; they do not edit, run formatters, create worktrees, or commit. If subagents are unavailable, perform the passes sequentially and report that limitation.
3. Combine overlapping findings. Apply only fixes that reduce complexity or correct a demonstrated bug within the scope. Discuss larger refactors first.
4. Run relevant Bun tests, package type checks, and oxlint/oxfmt on touched files. For desktop UI or IPC verification, follow `.cursor/rules/056-tauri-mcp-debugging.mdc`; the user starts the dev app.
5. Report fixes, checks, skipped findings, and any behavior changes. Preserve unrelated work. Commit or publish only when requested.
