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

Prefer clear names and small functions over comments that narrate assignments, loops, or calls. Explain non-obvious business rules, algorithm choices, constraints, and meaningful TODOs. Document public APIs and complex interfaces.

Validate data at external boundaries and before critical operations such as deleting user data. Avoid repeating checks already guaranteed by internal types or validated callers. Let invalid internal API use surface as a programming error instead of hiding it behind fallback values.

Catch an error when you can recover, handle an expected business condition, improve the user experience, or add actionable context. Catching only to rethrow adds no value.

When reviewing a comment or guard, ask whether better naming or types could replace it, and whether it protects a real failure case.

## Large files and resources

- Stream large files instead of reading them entirely into memory or accumulating buffers.
- Clean up temporary files and streams.
- Set file-size limits based on available memory.
