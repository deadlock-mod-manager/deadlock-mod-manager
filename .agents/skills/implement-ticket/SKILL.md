---
name: implement-ticket
description: Implement a Linear or GitHub issue through verified local changes under DMM conventions.
disable-model-invocation: true
---

# Implement a ticket

1. Read the supplied Linear URL/identifier using the connected Linear tools, or a GitHub issue using `gh issue view`. Read comments, linked decisions, dependencies, and acceptance criteria. For Linear, follow [linear](../linear/SKILL.md). Ask for missing decisions that prevent implementation; do not invent acceptance criteria or ignore blockers.
   Completion: each criterion maps to a check.
2. Read `AGENTS.md`, relevant Cursor rules, [domain vocabulary](../../../apps/docs/content/docs/developer-docs/domain-model.mdx), product context, and architecture docs. Inspect existing code and tests in the target package and identify reusable helpers.
   Completion: name the affected files and the existing pattern to follow.
3. Inspect the branch and dirty files. Work on the current branch unless the user asks for another. When asked for a Linear branch, use the ticket's supplied branch name, respecting DMM's branch rules. Preserve unrelated edits.
4. Implement and add focused Bun tests for functional changes. Use i18n for UI strings, React Query mutations for async UI actions, BaseError subclasses, and structured logging.
   Completion: point to code and evidence for every criterion.
5. Review the task diff for unnecessary complexity using the existing deslop and code-quality guidance. Independent subagent review is optional and runs when requested.
6. Run the smallest relevant tests and package checks, `pnpm check:toolchain`, lint and format. Keep test files type-checked through a dedicated test config when the production config excludes them. Use Tauri MCP for live desktop checks; ask the user to start the app.
   Completion: report actual commands and results, including pre-existing failures and unverified runtime behavior.
7. Add a changeset for user-visible changes. Commit only when requested, staging task paths. Prepare a conventional PR title and a body explaining what/why, validation, and AI assistance; include calldiff only when useful for changed call flow. A human reviews and authorizes PR submission. Update ticket state or post comments only when explicitly requested.
