---
name: rebase
description: Fetch the latest default branch and rebase the current branch on top of it, resolving any merge conflicts automatically. Use when asked to "rebase", "rebase on main", "update branch with main", "sync with main", "rebase onto latest", or "/rebase".
---

# Rebase Current Branch on Latest Main

Fetch the latest default branch from `origin` and rebase the current branch on top of it, resolving conflicts as they appear. Do not push unless the user asks.

## Step 1: Pre-Flight Checks

Before doing anything, verify the working tree state:

1. Run `git status --porcelain=v1 --branch`. Confirm there are no uncommitted changes. If there are:
   - List them to the user
   - Ask whether to stash (`git stash push -u -m "rebase-skill autostash"`) or abort
   - Do NOT silently discard work
2. Run `git rev-parse --abbrev-ref HEAD` to capture the current branch name. If it is `main`, `master`, or the default branch, stop and tell the user there is nothing to rebase.
3. Determine the default branch:
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```
   Fall back to `git symbolic-ref refs/remotes/origin/HEAD --short | sed 's@^origin/@@'` if `gh` is unavailable. Cache the result as `$BASE`.
4. Confirm an `origin` remote exists with `git remote get-url origin`.

## Step 2: Fetch the Latest Base

Fetch only what is needed and prune stale refs:

```bash
git fetch --prune origin "$BASE"
```

If the fetch fails (network/auth), report the exact error and stop. Do not start a rebase against stale refs.

## Step 3: Start the Rebase

Run:

```bash
git rebase "origin/$BASE"
```

Capture both stdout and stderr. There are three outcomes:

| Outcome       | How to Detect                                                  | Action                                                                      |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Clean rebase  | Exit 0, no `CONFLICT` lines                                    | Go to Step 5                                                                |
| Conflicts     | Exit non-zero, output contains `CONFLICT` or `could not apply` | Go to Step 4                                                                |
| Other failure | Exit non-zero without conflict markers                         | Run `git rebase --abort`, restore any stash from Step 1, report error, stop |

## Step 4: Resolve Conflicts (Loop)

Repeat this loop until `git status` reports the rebase is no longer in progress.

### 4a. Inventory the Conflicts

Run `git status --porcelain=v1`. Conflicted files are marked `UU`, `AA`, `DU`, `UD`, `AU`, `UA`, or `DD`.

For each conflicted file:

- Read the full file (do not rely on `<<<<<<<` markers alone for context)
- Identify the conflict regions delimited by `<<<<<<<`, `=======`, `>>>>>>>`
- Identify which side is "ours" (the rebased commit being replayed) and "theirs" (the base branch tip). During `git rebase`, "ours" is the upstream base and "theirs" is the commit being replayed — this is the opposite of `git merge`. Verify with `git log --oneline -1 HEAD` and `git log --oneline -1 REBASE_HEAD` if unsure.

### 4b. Resolve Each File

Apply this decision logic per conflict region:

| Situation                                                                                            | Resolution                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, `package-lock.json`, `yarn.lock`, `bun.lockb`, `uv.lock`) | Take the base branch version, then regenerate (`pnpm install`, `cargo build`, `npm install`, etc.) at the end of the rebase, not per-step      |
| Generated files (build output, snapshots, codegen)                                                   | Take the base branch version and regenerate after the rebase completes                                                                         |
| Both sides changed unrelated lines in the same hunk                                                  | Combine both changes, preserving intent from each                                                                                              |
| Same line changed differently with clear semantic conflict                                           | Read surrounding code, infer intent, prefer the change that is consistent with the rest of the diff being replayed; if ambiguous, ask the user |
| Import/export lists, `CHANGELOG.md`, version bumps                                                   | Merge by union (keep entries from both sides, deduplicated, sorted as the file dictates)                                                       |
| Whitespace-only / formatting-only conflicts                                                          | Take whichever side matches the project's formatter; run the formatter after if needed                                                         |
| Truly ambiguous business logic                                                                       | Stop, present both versions to the user with file paths and line ranges, and ask which to keep                                                 |

After editing, ensure no `<<<<<<<`, `=======`, or `>>>>>>>` markers remain:

```bash
git grep -nE '^(<{7}|={7}|>{7})( |$)' -- ':(exclude)*.md'
```

### 4c. Stage and Continue

```bash
git add <resolved files>
git rebase --continue
```

If the rebase reports "No changes - did you forget to use 'git add'?", the commit became empty after resolution. Run `git rebase --skip`.

If new conflicts appear on the next commit, return to step 4a.

If at any point you are stuck (more than 2 attempts on the same file produce conflict markers, or the user asked to stop), run `git rebase --abort`, restore the stash, and report.

## Step 5: Post-Rebase Validation

Once the rebase completes:

1. Confirm state: `git status` should show "nothing to commit, working tree clean" and the branch ahead of `origin/$BASE`.
2. If lockfiles or generated files were taken from base in Step 4, regenerate them now:
   - `pnpm install` if `pnpm-lock.yaml` was touched
   - `cargo build` (or `cargo check`) if `Cargo.lock` was touched
   - The project-appropriate codegen command for any generated sources
     Stage and amend into the relevant commit only if regeneration produced changes; otherwise leave alone.
3. If a stash was created in Step 1, ask the user before popping it (`git stash pop`).

## Step 6: Report

Tell the user:

- The base branch and SHA you rebased onto (`git rev-parse --short "origin/$BASE"`)
- How many commits were replayed (`git rev-list --count "origin/$BASE..HEAD"`)
- Which files had conflicts and a one-line summary of how each was resolved
- Any follow-up they should do (e.g., "lockfile regenerated, please verify"), and whether a force-push is required (`git push --force-with-lease`) — but do not push unless explicitly asked

## Hard Rules

- NEVER run `git push --force` (without `--with-lease`) on the user's behalf
- NEVER push at all unless the user explicitly asks
- NEVER run `git rebase --skip` to bypass conflicts you do not understand — only for genuinely empty commits
- NEVER discard uncommitted work without explicit confirmation
- NEVER resolve a conflict by deleting code from one side without reading both sides in full
