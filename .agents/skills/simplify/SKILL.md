---
name: simplify
description: Simplify scoped code with parallel read-only review subagents (quality, performance, reuse, deslop), then apply targeted cleanup fixes without a large refactor. Use before committing code changes or when asked to simplify or clean up a diff.
---

# Simplify

Run four parallel read-only reviewers on a scoped diff, aggregate their findings, then make targeted cleanup edits yourself. The goal is less complexity and better reuse, not a rewrite.

## When to use

- After `/simplify` or when asked to simplify code, reduce complexity, or clean up a diff.
- Before review when a change works but feels heavier than it needs to be.
- When you want parallel review passes (quality, performance, reuse, slop) without handing edits to subagents.

## Scope selection

1. Explicit paths, symbols, diff, or area the user named.
2. Otherwise: combined `git diff` + `git diff --cached`, separating the current task from pre-existing work.
3. If no local diff: files or symbols mentioned in the conversation.
4. Last resort: `git show HEAD`.
5. Do not broaden scope beyond the selected work unless needed to understand local patterns.

State the scope before reviewing.

## Subagents (read-only, parallel)

Launch all four with the same model as the parent, giving each the relevant project rules and acceptance criteria. They report only: no edits, formatters, worktrees, or commits. If subagents are unavailable, run the passes sequentially and report that limitation.

**Code quality**: low-information comments, one-off helpers, nullable proliferation, catch-all try/catch, premature abstraction, weak type escapes, duplicated or derived state, dead compatibility code.

**Performance**: blocking hot-path work, uncached expensive ops, busy waits, string concat in loops, N+1 I/O, chatty logging in tight loops.

**Reuse**: existing helpers or patterns elsewhere in the codebase or already in the diff.

**Deslop**: apply [deslop](../deslop/SKILL.md)'s "What to look for" and "Guardrails" to the same scope (not deslop's own diff against main). Report each instance with file:line, the issue, and the local norm it violates (name the file or doc that establishes it). Skip deslop's edits; the parent applies fixes.

## Fixing

- Aggregate findings and fix what clearly reduces complexity, improves reuse, or corrects a demonstrated bug. Drop deslop findings that cite no local norm, and dedupe overlap with the code-quality reviewer.
- Skip issues that need more user context or a refactor much larger than the original diff; note those in the summary.
- Run relevant Bun tests, package type checks, and oxlint/oxfmt on touched files. For desktop UI or IPC verification, follow [verify-desktop](../verify-desktop/SKILL.md); the user starts the dev app.

## Output should feel like

- A short summary: what was fixed, what was skipped but recommended, and which checks ran.
- Behavior preserved unless a clear bug was fixed.
- Edits stay inside the selected scope. Preserve unrelated work; commit or publish only when requested.

## Related

- [deslop](../deslop/SKILL.md): runs here as the fourth reviewer; invoke it directly to deslop a whole branch diff.
- [thermo-nuclear-code-quality-review](../thermo-nuclear-code-quality-review/SKILL.md): deeper structural review when simplification isn't enough.
- [improve-codebase-architecture](../improve-codebase-architecture/SKILL.md): longer-horizon architecture opportunities.
