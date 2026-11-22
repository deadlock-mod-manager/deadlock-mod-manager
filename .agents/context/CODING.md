# Coding conventions

Read [AGENTS.md](../../AGENTS.md) for mandatory type, import, error, logging, testing, and component ownership rules. Match the surrounding code when modifying a package.

## TypeScript and JavaScript

- Use interfaces for object shapes that will be extended, and type aliases for unions and complex types.
- Prefer named imports that support tree shaking. Keep imports at the top of the file.
- Reuse shared packages for shared behavior instead of duplicating implementations across apps.

## React and styling

- Use functional components, hooks, named exports, and explicit prop types.
- Keep each component focused on one responsibility; follow the [component splitting skill](../skills/split-react-components/SKILL.md) when extracting substantial children.
- Use Tailwind CSS utility classes for one-off styling and shared components for repeated patterns.
- Read [product context](PRODUCT.md) and [design guidance](DESIGN.md) before UI work. Follow the framework already used by the target app.

### Effects

When adding or reviewing a `useEffect`, read React's [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) guidance. Apply it to the current changes unless the user requests a broader review.

- Calculate derived values during rendering instead of storing them through an effect. Memoize expensive calculations when needed.
- Put logic caused by a user action in its event handler.
- Avoid chains of effects that update state based on other state; derive values or update related state together in the originating action.
- Use effects to synchronize with external systems. Include the dependencies and cleanup that synchronization needs.
- When asked for a review only, explain proposed changes without applying them.

## Backend and desktop boundaries

- In Bun + Hono services, use middleware for cross-cutting concerns, organize routes by resource, and validate request data with Zod.
- Return structured errors and handle expected external failures where recovery is meaningful.
- Keep desktop React code separate from the Rust backend. Use Tauri commands for system interactions and handle errors across IPC.

## Comments and validation

Let clear names, explicit types, and small functions explain what the code does. Add a comment only when it supplies information the code cannot express:

- **External constraints and invariants**: platform or runtime quirks (Flatpak, WebKitGTK, Steam, Valve formats, CI coupling), ordering or concurrency requirements, and deliberate non-obvious tradeoffs.
- **Exported API contracts**: JSDoc or doc comments on public exports in shared packages or complex interfaces when behavior, units, or edge cases are not obvious from the signature. Keep unexported helpers self-describing through their names and types.
- **Tracked debt**: link `TODO`, `FIXME`, `HACK`, and `XXX` notes to an issue (`TODO(#123)` or a URL) rather than leaving untracked reminders. Delete dead code instead of commenting it out; git history preserves it.
- **Single source of facts**: rely on the constant or expression itself for defaults, timeouts, and limits rather than restating values in prose where they can drift, and structure multi-step code into named helpers rather than `Step 1:` / narrating comments.
- **Architectural decisions**: reserve `docs/adr/` for cross-cutting, hard-to-reverse decisions; keep local constraints next to the code that depends on them.

Validate data at external boundaries and before critical operations such as deleting user data. Avoid repeating checks already guaranteed by internal types or validated callers. Let invalid internal API use surface as a programming error instead of hiding it behind fallback values.

Catch an error when you can recover, handle an expected business condition, improve the user experience, or add actionable context. Catching only to rethrow adds no value.

When reviewing a comment or guard, ask whether better naming or types could replace it, and whether it protects a real failure case.

## Large files and resources

- Stream large files instead of reading them entirely into memory or accumulating buffers.
- Clean up temporary files and streams.
- Set file-size limits based on available memory.
