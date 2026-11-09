---
name: deslop
description: Remove AI-generated code slop from a branch diff — unnecessary comments, defensive checks, any-casts, nested code inconsistent with the surrounding codebase, and low-signal tests. Use after an AI-assisted implementation, before committing or opening a PR, or when asked to "deslop", "remove slop", or "clean up AI code".
---

# Deslop

Check the diff against main and strip out the tells of AI-generated code: comments that narrate the obvious, try/catch blocks on trusted paths, `any` casts used to dodge type errors, nesting that should be early returns, and tests that guard nothing.

The failure mode this exists for: AI-assisted code that passes review because it works, but reads like it was written by someone who doesn't know the codebase.

## When to use

- After an AI-assisted coding session before opening a PR.
- During review when something in the diff feels foreign to the surrounding style.
- Any time you see comments explaining what the code does rather than why.

## What to look for

- **Redundant comments** — anything that restates what the code already says clearly.
- **Defensive over-checking** — null guards, try/catch, or fallback values on code paths where the caller guarantees safety.
- **`any` casts** — used to silence type errors rather than fix them.
- **Deep nesting** — logic that could be flattened with early returns or guard clauses.
- **Style drift** — patterns inconsistent with the file and the files around it.
- **Low-signal tests** — tests added or modified in the diff that would not catch a real regression. For each one, name the regression it catches that nothing else does; delete it if you can't. Typical cases:
  - restating a one-line helper, constant, regex, or path join;
  - asserting what the type checker or a schema already enforces;
  - duplicating coverage another test or layer already gives (a TS wrapper test repeating the Rust test underneath, a second case that exercises the same branch);
  - mocking so much that the test only checks the mocks were called;
  - snapshotting or asserting incidental output (exact log text, copy, markup) rather than behavior.

  Delete whole tests, not individual assertions inside a test that earns its place. Drop helpers, fixtures, and test files left unused by the deletion.

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- Match the local style — don't impose a different convention, remove the deviation from the existing one.
- Limit test removal to tests the diff adds or changes; flag low-signal tests elsewhere in the summary instead of deleting them.
- Follow [coding conventions](../../context/CODING.md) and [project logging](../logging-best-practices/references/project-logging.md).

## Output should feel like

- The diff shrinks. Lines removed, not added.
- The remaining code is indistinguishable from code written by whoever owns the file.
- Every remaining test guards a regression you can name.
- Summary: 1–3 sentences, no bullet list of every change made. Mention removed tests by name so the user can push back.

## Related

- `split-react-components` — companion cleanup for React file structure.
- [React effects](../../context/CODING.md#effects) — guidance for reviewing useEffect patterns.
