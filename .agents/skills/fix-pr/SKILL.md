---
name: fix-pr
description: Fix PR Comments
disable-model-invocation: true
---

# Fix PR Comments

Review all open comments on the current branch's pull request, rank them by relevance, prompt for confirmation where ambiguous, then apply fixes.

## Instructions

### 1. Gather Branch and PR Context

```bash
echo "=== BRANCH ===" && git rev-parse --abbrev-ref HEAD && echo "=== PR INFO ===" && gh pr view --json number,title,url,state,headRefName,baseRefName && echo "=== PR COMMENTS ===" && gh pr view --json comments --jq '.comments[] | {author: .author.login, body: .body, createdAt: .createdAt}' && echo "=== PR REVIEW COMMENTS ===" && gh pr view --json reviews --jq '.reviews[] | {author: .author.login, body: .body, state: .state, submittedAt: .submittedAt}' && echo "=== PR DIFF COMMENTS ===" && gh api "repos/{owner}/{repo}/pulls/$(gh pr view --json number --jq '.number')/comments" --jq '.[] | {author: .user.login, body: .body, path: .path, line: .line, diff_hunk: .diff_hunk, created_at: .created_at}'
```

### 2. Rank Comments by Relevance

Analyze all gathered comments and categorize them:

**Priority tiers:**

- **P1 - Must fix**: Bug reports, broken functionality, security issues, failing tests, incorrect logic
- **P2 - Should fix**: Code style violations against project conventions, missing error handling, performance concerns, unclear naming
- **P3 - Consider**: Nitpicks, optional suggestions, cosmetic preferences, subjective style opinions

**Display a ranked list** grouped by priority:

```
P1 (Must Fix):
  [1] <file>:<line> — <author>: "<comment body>"
  ...

P2 (Should Fix):
  [2] <file>:<line> — <author>: "<comment body>"
  ...

P3 (Consider):
  [3] <file>:<line> — <author>: "<comment body>"
  ...
```

### 3. Prompt for Confirmation on Ambiguous Comments

For each **P2** and **P3** comment, ask the user:

> Comment [N] — `<author>` on `<file>:<line>`:
> "<comment body>"
>
> Fix this? (yes / no / skip all remaining)

- **P1 comments** are fixed automatically without prompting.
- **P2/P3 comments** require explicit user confirmation.
- If the user says **"skip all remaining"**, skip the rest of the prompts and only apply already-confirmed fixes.

Wait for all user responses before proceeding to the fix step.

### 4. Apply Fixes

For each confirmed comment (all P1s + user-confirmed P2/P3s):

- Read the relevant file(s)
- Understand the context from the diff hunk
- Apply the minimal, focused fix that addresses the comment
- Follow all project coding conventions from [030-coding-style](mdc:.cursor/rules/030-coding-style.mdc)
- Do not make unrelated changes

After all fixes are applied:

```bash
pnpm lint:fix
pnpm format:fix
```

### 5. Summarize

Show a concise summary:

```
Fixed:
  [1] <file>:<line> — <brief description of fix>
  ...

Skipped:
  [N] <file>:<line> — <reason or "user skipped">
  ...
```

Then suggest staging and committing with the `/commit` command.

## Key Points

- Use `gh` CLI for all GitHub interactions
- Never modify files not related to a specific comment being addressed
- If a comment is unclear, err on the side of asking rather than guessing
- Respect all rules in `.cursor/rules/` when applying fixes
- Do not create a changeset unless a fix qualifies per [090-changesets](mdc:.cursor/rules/090-changesets.mdc)

## Example Usage

**User:** "fix pr", "review pr comments", or `/fix-pr`

**Response:**

1. Fetch branch, PR metadata, and all comment types
2. Rank and display comments by priority
3. Prompt user for P2/P3 confirmations
4. Apply all approved fixes
5. Run lint and format
6. Show summary and suggest commit
