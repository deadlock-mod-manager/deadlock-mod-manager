---
name: split-react-components
description: Split React/TSX files containing multiple inlined components into separate single-responsibility files. Use when asked to "split components", "extract components", "single responsibility", "clean up component file", "too many components in one file", "component slop", or when running deslop/cleanup on React code.
disable-model-invocation: true
---

# Split React Components

One file, one component, its own types, its own hooks. Anything else is slop.

## What counts as slop

1. **Inline sub-components** defined inside another component's function body. These re-create on every render and bloat the host file. Even if they're small.
2. **SVG icon components** inlined alongside the component that uses them. These belong in a dedicated icons file.
3. **Large string literals / data constants** (SVG markup, config arrays, static data) taking more than ~5 lines.
4. **Interfaces/types** that only exist to serve an extracted component — they travel with it.
5. **Hooks** that serve a single sub-component — extract alongside it.

### Do NOT split

- Tiny styled wrappers (< 5 lines) tightly coupled to the parent's markup.
- Next.js app router files in `apps/docs` only (`loading.tsx`, `error.tsx`, `layout.tsx`).
- Test files.

## Workflow

1. **Scan** — Read the target file(s). List every component definition (named functions, arrow components, `forwardRef` wrappers).
2. **Classify** — Primary export vs. inlined sub-component/helper.
3. **Plan** — For each extraction:
   - Destination path (follow project conventions — kebab-case filenames, named exports).
   - Which imports, types, constants move with it.
   - What the parent needs to import after extraction.
4. **Execute** — Create new files, remove inlined definitions, add imports in parent.
5. **Verify** — No circular imports. Run lints on all modified files.

## File naming

- Match project conventions: kebab-case filenames, named exports (`export const ComponentName`).
- Icon components → sibling `icons.tsx` or `icons/` subfolder.
- Data constants → sibling file named after the constant (e.g. `logo-svg.ts`).
- Types → co-locate with the component that owns them.

## Example

**Before** — `logo-dropdown.tsx` (167 lines, 5 components in one file):

```tsx
import { FC, useState } from 'react';

interface DropdownItem { /* ... */ }
interface DropdownSection { /* ... */ }

export const LogoDropdown: FC = () => {
  const logoSvg = `<svg>...12 lines...</svg>`;

  const GitHubIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className}>...</svg>
  );
  const LinkedInIcon: FC<{ className?: string }> = ({ className }) => (...);
  const TwitterIcon: FC<{ className?: string }> = ({ className }) => (...);
  const StackOverflowIcon: FC<{ className?: string }> = ({ className }) => (...);

  const sections = [/* uses all icons above */];
  return <div>{/* renders sections */}</div>;
};
```

**After** — 3 files:

`social-icons.tsx` (pure, no state):

```tsx
import { FC } from 'react';

export const GitHubIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className}>...</svg>
);
export const LinkedInIcon: FC<{ className?: string }> = ({ className }) => (...);
export const TwitterIcon: FC<{ className?: string }> = ({ className }) => (...);
export const StackOverflowIcon: FC<{ className?: string }> = ({ className }) => (...);
```

`logo-svg.ts` (data, not a component):

```ts
export const logoSvg = `<svg>...</svg>`;
```

`logo-dropdown.tsx` (just the stateful component):

```tsx
import { FC, useState } from "react";
import {
  GitHubIcon,
  LinkedInIcon,
  TwitterIcon,
  StackOverflowIcon,
} from "./social-icons";
import { logoSvg } from "./logo-svg";

interface DropdownItem {
  /* ... */
}
interface DropdownSection {
  /* ... */
}

export const LogoDropdown: FC = () => {
  // only state and rendering logic remain
  return <div>{/* renders sections */}</div>;
};
```

## Batch mode

When asked to scan a directory or the whole project:

1. Glob for `**/*.tsx` files.
2. For each file, count component definitions. Flag files with 2+ components where at least one is not the primary export.
3. Present a summary: `| File | Components | Extractable | Reason |`
4. Ask before executing, or execute immediately if the user said to fix them all.
