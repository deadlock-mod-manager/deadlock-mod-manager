---
name: deslop
description: Remove AI-generated code slop from a branch diff — unnecessary comments, defensive checks, any-casts, and nested code inconsistent with the surrounding codebase. Use after an AI-assisted implementation, before committing or opening a PR, or when asked to "deslop", "remove slop", or "clean up AI code".
---

# Deslop

Check the diff against main and strip out the tells of AI-generated code: comments that narrate the obvious, try/catch blocks on trusted paths, `any` casts used to dodge type errors, and nesting that should be early returns.

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

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- Match the local style — don't impose a different convention, remove the deviation from the existing one.
- Follow [030-coding-style](../../../.cursor/rules/030-coding-style.mdc) and [040-logging](../../../.cursor/rules/040-logging.mdc).

## Output should feel like

- The diff shrinks. Lines removed, not added.
- The remaining code is indistinguishable from code written by whoever owns the file.
- Summary: 1–3 sentences, no bullet list of every change made.

## Related

- `split-react-components` — companion cleanup for React file structure.
- `you-might-not-need-an-effect` — companion audit for useEffect patterns.
