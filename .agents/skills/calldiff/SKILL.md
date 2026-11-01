---
name: calldiff
description: Generate call-stack trees and diffs with calldiff for plans, design docs, and PR descriptions when a change rewires who-calls-whom. Use when a reviewer needs to see which callees appeared, disappeared, or moved under an entrypoint in the desktop Rust backend, the React frontend, or the API.
---

# Call-stack diffs with calldiff

Calldiff is optional. Use it only when a tree helps a reviewer follow a real call-flow change. Never add one to a routine chat summary, status update, or wrap-up. For a visual walkthrough of the same flow, paste the trees into a [show-me](../show-me/SKILL.md) view.

## When to include a tree

Include a call-stack diff in a plan, design doc, or PR description only when all of these are true:

- The change rewires call flow: new, removed, or moved callees; refactored control flow; extracted or inlined functions.
- The new vs old call tree is not obvious from the code or a short prose description.
- The audience is a reviewer who needs to see how control flow moved.

Skip calldiff without running it or mentioning the omission for routine chat replies; UI/copy, styling, configuration, dependencies, translations, tests, or docs changes; small or obvious call-flow changes; and empty or noisy trees.

## Invocation

Run `npx calldiff@latest`. `@latest` keeps a stale npx cache from being used. Do not install calldiff globally or add a repo script. Tree-sitter grammars download on first use into `~/.cache/calldiff/grammars`, so the first run is slow.

## When to run

| Situation                                        | Command                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Documenting a branch against its base            | `npx calldiff@latest diff <base> HEAD`, where `<base>` is the PR base, usually `origin/main` |
| Uncommitted work against `HEAD`                  | `npx calldiff@latest diff`                                                    |
| Plan or design against current code (no code yet) | `npx calldiff@latest tree --entry <Entrypoint>` for the current flow          |

## How to run

1. Find the changed entrypoints in the git diff. Rust methods are `Type.method` (`ModManager.install_mod`); free functions and TS exports are bare names (`install_mod`, `useOneClickInstall`).
2. Pass `--entry` or `--file` and a path prefix so the tree stays small. In this monorepo, inferred trees get huge.

   ```bash
   npx calldiff@latest diff origin/main HEAD --entry ModManager.install_mod apps/desktop/src-tauri/src/mod_manager
   npx calldiff@latest diff --file apps/desktop/src/pages/settings.tsx
   ```

3. Paste the ASCII output in a fenced `diff` block under a **Callstack** heading.
4. Narrate what the `+` and `-` lines mean: a new callee, a removed callee, or a callee moved under a new helper. Pick the 1-3 entrypoints that explain the change.
5. If calldiff fails or finds nothing, do not write a section that says so. A reviewer cannot act on that. If the rewiring needs their attention, hand-write the tree and mark it as hand-written. Otherwise drop the Callstack heading and let the prose explain it. Never invent a tree.

## Useful flags

```bash
npx calldiff@latest tree --entry ModManager.install_mod --max-depth 2
npx calldiff@latest tree --entry ModManager.install_mod --locs
npx calldiff@latest reach --entry ModManager.install_mod --to ModManager.setup_game_for_mods
```

`--file` expands to every export in that file. `--max-depth` caps the tree (default 12). `--locs` adds the `file:line` of each call site. `--format md` is fine when you embed the tree in a doc.

Calldiff is syntactic (Tree-sitter), not a type checker. Dynamic calls, closures passed as callbacks, and trait-object dispatch do not resolve. A method called through a field (`self.vpk_manager.copy_vpks_with_prefix()`) shows under the caller's type, so `reach` to the real `VpkManager.copy_vpks_with_prefix` finds no path. Tauri `invoke` calls from the frontend do not link to Rust commands, so trace the two sides separately.
