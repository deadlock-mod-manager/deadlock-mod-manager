# TypeScript error handling

Throw a `BaseError` subclass from `@deadlock-mods/common` so errors carry a stable `code` and optional `originalError`.

## Choosing an error class

| Situation | Prefer |
| --- | --- |
| Missing env / invalid config | `ConfigurationError` |
| External provider or integration (e.g. GameBanana) | `ProviderError` |
| Archive / extraction failure | `ExtractionError` |
| Resource not found (non-DB or generic API) | `NotFoundError` |
| Auth required / permission denied | `UnauthorizedError` / `ForbiddenError` |
| Invalid input / parsing | `ValidationError` |
| Drizzle / Postgres errors | `mapDrizzleError` or DB-specific errors from `@deadlock-mods/common` |
| Catch-all internal failure | `RuntimeError` or `UnknownError` |

## Domain-specific errors

Add a `BaseError` subclass in `packages/common/src/errors/` when the same failure mode appears in multiple places and needs a dedicated `GenericErrorCode` or `ApiErrorCode`. Prefer extending an existing class over introducing duplicates.

See [generic errors](../../packages/common/src/errors/generic.ts) and [error codes](../../packages/common/src/errors/codes.ts).

Tests may use raw `Error` when the harness expects it. React context invariants in generated UI, such as shadcn components in `packages/ui`, may keep raw `Error` to stay aligned with upstream.
