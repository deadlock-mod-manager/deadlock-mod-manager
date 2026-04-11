---
name: worktree-management
description: Manage git worktrees using wtx CLI for parallel development workflows on Windows. Use when asked to "create a worktree", "add a worktree", "switch worktree", "remove worktree", "list worktrees", "clean worktrees", "wtx", or set up parallel development branches.
compatibility: Windows only. Requires PowerShell 7+ (pwsh) and git on PATH.
---

# Manage Git Worktrees with wtx

Use the `wtx` PowerShell CLI to create, navigate, and manage git worktrees for parallel development in this monorepo.

**This skill is Windows-only.** If the current platform is not Windows (check `$env:OS` or `uname`), stop and inform the user that wtx requires Windows with PowerShell 7+. Recommend [git-worktree-runner](https://github.com/coderabbitai/git-worktree-runner) for Linux/macOS instead — see the Worktree Development section in `CONTRIBUTING.md`.

## Prerequisites

Before running any wtx command, verify the environment:

1. Confirm the shell is PowerShell 7+ (`pwsh`), not `cmd.exe` or bash-on-WSL.
2. Confirm `wtx` is installed: `Test-Path "$env:LOCALAPPDATA\Programs\wtx\wtx.ps1"` must return `True`.
3. Confirm the repo is initialized: `.wtx.kv` exists in the repo root.

If `wtx` is not installed, direct the user to install it:
```powershell
git clone https://github.com/littlesmilelove/worktree.ps.git $env:TEMP\worktree.ps
pwsh -File $env:TEMP\worktree.ps\install.ps1
. $PROFILE
```

If `.wtx.kv` is missing, run `wtx init` inside the repo first.

## Step 1: Determine the Operation

| User Intent | wtx Command |
|-------------|-------------|
| Create a new worktree | `wtx add <name>` |
| List existing worktrees | `wtx list` |
| Get path to a worktree | `wtx path <name>` |
| Get main repo path | `wtx main` |
| Remove a worktree | `wtx rm <name> --yes` |
| Clean numeric worktrees | `wtx clean` |
| View/change config | `wtx config list\|get\|set\|unset` |

## Step 2: Execute the Command

All wtx commands **must** run through PowerShell 7 to ensure the shell hook and profile are loaded:

```powershell
pwsh -Command "& { . $PROFILE; wtx <command> }"
```

Do **not** run `wtx` via `cmd.exe`, Git Bash, or WSL — it will fail or behave unexpectedly.

### Creating a Worktree

When creating a worktree with `wtx add <name>`:

1. A new directory is created at `../<repo>.<name>` (e.g., `../deadlock-modmanager.fix-123`)
2. A branch `feat/<name>` is created from the default branch (`main`)
3. The following files are automatically copied from the main repo:
   - `.env`, `.env.local` (environment config)
   - `.tauri/updater.key`, `.tauri/updater.key.pub` (Tauri signing keys)
4. `pnpm install` runs automatically to install dependencies
5. `pnpm dev` starts the dev server (logs to `<worktree>/tmp/dev.log`)

### Naming Conventions

Follow the project's branch naming from `.cursor/rules/100-git-conventions.mdc`:

- Use descriptive kebab-case names: `wtx add fix-mod-conflict`
- Include ticket numbers when applicable: `wtx add KR-123-add-collections`
- Numeric names (e.g., `wtx add 3000`) are for quick throwaway worktrees

### Removing a Worktree

Before removing, warn the user to:
1. Close any editors or terminals open in the worktree directory
2. Commit or stash any unsaved changes

Then run: `wtx rm <name> --yes`

## Step 3: Post-Operation Guidance

After creating a worktree, inform the user:
- The worktree path (from `wtx path <name>`)
- The branch name (`feat/<name>`)
- That they can switch to it with `wtx <name>` in PowerShell
- That they can return to main with `wtx main`

## Configuration Reference

Current repo config is in `.wtx.kv`. Key settings:

| Key | Default | Description |
|-----|---------|-------------|
| `repo.path` | (set by init) | Main repo absolute path |
| `repo.branch` | `main` | Default branch |
| `add.branch-prefix` | `feat/` | Branch name prefix |
| `add.copy-env.files` | `.env`, `.env.local`, `.tauri/*` | Files copied to new worktrees |
| `add.install-deps.command` | `pnpm install` | Dependency install command |
| `add.serve-dev.command` | `pnpm dev` | Dev server command |
