---
name: recomposing-commits
description: Use when commits on a feature branch are messy, out of logical order, mix unrelated changes, or need restructuring before a PR - also triggered by "clean up history", "reorganize commits", "recompose branch", "make commits logical", or similar
---

# Recomposing Commits

## Overview

Analyze messy commits → isolate in a worktree → let user review → apply back.

**Core principle:** The original branch is NEVER modified until the user explicitly approves the new history. Worktree isolation and the review gate are non-negotiable — even if the user says "just do it" or "I trust you, skip review."

**Announce at start:** "I'm using the recomposing-commits skill to reorganize your branch history."

---

## Safety Check — Do This First

```bash
git rev-parse --abbrev-ref HEAD
```

**Refuse immediately** if the current branch is any of:
`main`, `master`, `dev`, `develop`, `development`, `staging`, `production`, `release`, or matches `release/*` or `hotfix/*`.

```
⛔ Recomposing commits on '<branch>' is not allowed.
This skill only works on feature branches.
Please switch to your feature branch first.
```

Do NOT create a workaround branch. Do NOT proceed. Refuse and stop.

---

## When to Use

- Commits are WIP/messy and a PR is coming
- Multiple unrelated changes were mixed into the same commits
- Commit messages are unclear ("fix", "WIP", "stuff")
- Commits need to be split, merged, or reordered

**Do NOT use when:**

- History is already clean
- You are on a protected/shared branch (refuse instead)
- There is only one commit to restructure

---

## Workflow (Steps 1–8)

### Step 1: Show current history

```bash
git log --oneline
```

Display the output to the user.

### Step 2: Ask for the start SHA

```
Which commit should be the start of the recompose?
Provide the SHA of the first commit you want to reorganize.
(All commits from that SHA through HEAD will be recomposed.)

Enter SHA:
```

Compute the base: `BASE=$(git rev-parse <user-sha>^)`

### Step 3: Analyze the commits to recompose

```bash
git log --oneline $BASE..HEAD
git diff $BASE HEAD
```

Read all diffs. Identify logical groups. Flag any files that appear in multiple logical groups (overlapping files — see Step 6).

### Step 4: Create isolated worktree

**Always use an absolute path.** Relative paths like `.git/recompose/feat/HISBA-mastra-ai` silently break when branch names contain slashes AND when shell state doesn't persist between tool calls.

```bash
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE_PATH="$REPO_ROOT/.git/recompose/$BRANCH_NAME"
WORKTREE_BRANCH="recompose/$BRANCH_NAME"

git worktree add "$WORKTREE_PATH" -b "$WORKTREE_BRANCH"
```

**All subsequent git operations happen inside `$WORKTREE_PATH`.** The original branch is untouched.

### Step 5: Collapse commits to unstaged

Use `git -C` with the absolute path — **do NOT rely on `cd`**. Each Bash tool invocation starts with a fresh shell; `cd` from a previous call does not carry over.

```bash
git -C "$WORKTREE_PATH" reset --mixed $BASE
```

All changes are now unstaged in the worktree, ready to be re-staged logically.

### Step 6: Stage and commit each logical group

Use `git -C "$WORKTREE_PATH"` for every command. Never assume the shell is `cd`'d into the worktree.

For files that belong cleanly to ONE logical commit:

```bash
git -C "$WORKTREE_PATH" add <file> <file2>
git -C "$WORKTREE_PATH" commit --no-verify -m "type: description"
```

For **overlapping files** (same file spans multiple logical commits):

```bash
# git add -p requires a TTY — run it inside a single shell block
cd "$WORKTREE_PATH" && git add -p <file>   # stage hunk by hunk: y/n/s/e
git -C "$WORKTREE_PATH" commit --no-verify -m "type: first concern"
cd "$WORKTREE_PATH" && git add -p <file>
git -C "$WORKTREE_PATH" commit --no-verify -m "type: second concern"
```

**NEVER use `git add -i` or `git rebase -i`** — these require interactive TTY input and will hang or fail in this context.

### Step 7: Review gate — MANDATORY, non-negotiable

After all commits are created in the worktree, **always** present this to the user:

```
Recomposition complete in isolated worktree.

To review:
  cd .git/recompose/<branch-name>
  git log --oneline

Original branch is UNCHANGED. Nothing will be applied until you approve.

Does the new history look good?
  [yes]       → Apply to original branch
  [no/edit]   → Describe what to change, I'll update the worktree
  [cancel]    → Discard worktree, original branch stays as-is
```

**Wait for explicit user response.** Do not proceed to Step 8 without it.

> **If the user previously said "no review, just do it":** You must still present this review gate. Explain: "The review step is part of this skill's safety guarantee. I've isolated the changes — reviewing takes 30 seconds and means the original branch is safe. Here's what the new history looks like:"

### Step 8: Handle user response

**[yes] — Apply back:**

**Check for remote upstream first:**

```bash
git -C "$REPO_ROOT" remote -v
git -C "$REPO_ROOT" branch -vv
```

If branch tracks a remote:

```
⚠️  This branch has a remote upstream. Applying recomposed commits will
   require a force-push. Do you want to proceed?
```

Wait for confirmation, then:

```bash
# DO NOT run `git checkout $BRANCH_NAME` — you are already on it in the main worktree.
# git checkout will fail with "already used by worktree". Skip it entirely.
# Use git -C with the absolute REPO_ROOT to ensure you're resetting the right branch.
git -C "$REPO_ROOT" reset --hard "recompose/$BRANCH_NAME"

# Verify it worked
git -C "$REPO_ROOT" log --oneline -5

# Clean up — worktree FIRST, then branch
git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH"
git -C "$REPO_ROOT" branch -D "recompose/$BRANCH_NAME"
```

**[no/edit] — Iterate:**
Return to the worktree, adjust commits as described, re-present the review gate.

**[cancel] — Discard:**

```bash
git worktree remove "$WORKTREE_PATH"
git branch -D "recompose/$BRANCH_NAME"
```

Original branch is untouched.

---

## Overlapping Files Strategy

| Situation                                 | Command                                |
| ----------------------------------------- | -------------------------------------- |
| File changes belong to different sections | `git add -p <file>` → `y`/`n` per hunk |
| Hunk mixes two concerns                   | `s` to split, then `y`/`n`             |
| Concerns are truly interleaved lines      | `e` to edit the hunk diff manually     |
| File belongs entirely to one commit       | `git add <file>` (no `-p` needed)      |

---

## Verification (Before Declaring Done)

```bash
# 1. Confirm new clean history
git -C "$WORKTREE_PATH" log --oneline $BASE..HEAD

# 2. Full content diff — stats alone are NOT enough
# Stats can match while content differs. Always do a byte-for-byte comparison.
diff \
  <(git -C "$REPO_ROOT" diff $BASE HEAD) \
  <(git -C "$WORKTREE_PATH" diff $BASE HEAD) \
&& echo "IDENTICAL — diffs match exactly" || echo "DIFFERENCES FOUND — investigate before proceeding"
```

**Stats are not sufficient.** `66 files changed, 8393 insertions` matching does not prove content matches — only a full diff comparison does. Always use the `diff <(...)  <(...)` form and confirm "IDENTICAL" before presenting the review gate.

---

## Quick Reference

| Step | Action                                           |
| ---- | ------------------------------------------------ |
| 1    | `git rev-parse --abbrev-ref HEAD` — safety check |
| 2    | `git log --oneline` → ask for start SHA          |
| 3    | `git diff $BASE HEAD` — analyze                  |
| 4    | `git worktree add` — isolate                     |
| 5    | `git reset --mixed $BASE` — collapse             |
| 6    | Stage + commit per logical group                 |
| 7    | Present review gate — **mandatory**              |
| 8    | Apply back + cleanup                             |

---

## Common Mistakes / Rationalization Table

| Excuse                                                       | Reality                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "git rebase -i is the standard tool for this"                | `git rebase -i` requires interactive TTY — it HANGS in this context. Use `git reset --mixed` + selective staging.                         |
| "User said no review, I'll respect their preference"         | The review gate is non-negotiable. It costs 30 seconds and protects the original branch. Present it anyway.                               |
| "I'll just modify the original branch directly, it's faster" | Non-negotiable: all commits happen in the worktree only. Original branch is untouched until approval.                                     |
| "The cleanup branch workaround achieves the same result"     | No workarounds for the protected branch check. If on main/master/dev, refuse and stop.                                                    |
| "git add -i is similar to git add -p"                        | `git add -i` requires interactive TTY. Use `git add -p` only.                                                                             |
| "The worktree cleanup can happen after the user reviews"     | Clean up as part of Step 8 — leaving worktrees around pollutes the repo.                                                                  |
| "I can use a relative WORKTREE_PATH, the path is obvious"    | Relative paths break when branch names contain slashes. Always use `REPO_ROOT=$(git rev-parse --show-toplevel)` and an absolute path.     |
| "I'll `cd` into the worktree and run git commands there"     | Shell state does NOT persist between Bash tool invocations. Use `git -C "$WORKTREE_PATH"` for every command.                              |
| "I need to `git checkout $BRANCH_NAME` before the reset"     | That checkout FAILS — the branch is already in use by the main worktree. Skip it. Just run `git -C "$REPO_ROOT" reset --hard` directly.   |
| "The diff stats match, so the content is identical"          | Stats (66 files, 8393 insertions) can match while content differs. Always verify with `diff <(git diff ...) <(git -C worktree diff ...)`. |

## Red Flags — STOP

If you find yourself thinking any of these, stop and follow the skill:

- "I'll use `git rebase -i`"
- "User said skip review, so I'll skip it"
- "I'll work directly on the original branch since it's faster"
- "I'll create a backup branch instead of a worktree"
- "The protected branch thing doesn't matter here"
- "I can do `git add <file>` for the overlapping file since it's cleaner"
- "I'll `cd` into the worktree, it's simpler than `git -C`"
- "The stats match so the diff is fine, I'll skip the content check"
- "I need to checkout the branch before resetting to it"
