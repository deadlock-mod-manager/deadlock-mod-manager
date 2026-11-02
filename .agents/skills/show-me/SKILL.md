---
name: show-me
description: Explain the current topic visually with diagrams, code-shape sketches, or a focused HTML artifact. Use when asked to show, draw, diagram, or visualize something.
---

Help the user understand the current topic of conversation visually. Skip the preamble and keep prose brief. Pick the smallest view that makes the key point clear.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show a static call tree. Run `npx calldiff@latest tree --entry <Entrypoint>` (see the [calldiff](../calldiff/SKILL.md) skill) and paste the ASCII output. Hand-write the tree only for hypothetical or unresolvable flow. When callbacks, dynamic dispatch, or other unresolved constructs affect behavior, add a brief prose note.

```text
ModManager.install_mod(self, deadlock_mod, profile_folder)
└─ ModManager.install_mod_resolving_conflicts(self, deadlock_mod, profile_folder, confirmed_conflicts)
   ├─ ModManager.install_mod_with_conflict_policy(self, deadlock_mod, profile_folder, conflict_policy)
   └─ ConflictPolicy.Replace()
```

- Show UI structure as a component tree, including state and module boundaries that matter:

```tsx
<SessionPage>
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

- Use `diff` when the point is what changes and the surrounding shape already exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

For a file-layout change:

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

For a call-tree or call-stack change that is worth showing (not a routine chat wrap-up), run `npx calldiff@latest diff` (or `diff <base> HEAD`; see the [calldiff](../calldiff/SKILL.md) skill) with `--entry` / `--file` on the relevant symbols. Paste the ASCII output. Hand-draw the callstack only for hypothetical or unresolvable flow. When callbacks, dynamic dispatch, or other unresolved constructs affect behavior, add a brief prose note.

```diff
  ModManager.install_mod_with_conflict_policy(self, deadlock_mod, profile_folder, conflict_policy)
- ├─ ModManager.get_addons_path(self, profile_folder)
- ├─ prepare_profile_for_write(addons_path)
+ ├─ ModManager.prepare_install_target(self, profile_folder)
+ │  ├─ ModManager.get_addons_path(self, profile_folder)
+ │  └─ prepare_profile_for_write(addons_path)
  ├─ ModManager.find_prefixed_vpks()
```

For a state or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1);
  return `use the ${skillName} skill`;
}
```

- For a visual UI, layout, state comparison, or concept too dense for Mermaid, write one focused HTML file — a diagram, an infographic, or a short slide deck, whichever fits the point. Match the product's colors, type, spacing, and components; use real labels and data; support desktop and mobile. Then open it for the user:

```
Bash(open path/to/show-me-{description}.html)
```

- Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.
