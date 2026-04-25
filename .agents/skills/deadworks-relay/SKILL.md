---
name: deadworks-relay
description: Update the Deadlock Mod Manager server browser implementation to match the latest Deadworks Relay Mesh Protocol v1 spec at ../deadworks-relay/spec/PROTOCOL.md. Use when the user asks to "sync server browser with relay spec", "update relay protocol", "match deadworks-relay spec", "update required_mods schema", "regenerate relay types", or when changes land in ../deadworks-relay that affect protocol shapes (registration, heartbeat, list/get servers, gossip, auth challenge, relays.json).
---

# Sync Server Browser With Deadworks Relay Spec

Bring the DMM server browser stack (relay client, API service, desktop UI) into compliance with the latest Deadworks Relay Mesh Protocol v1 defined at `../deadworks-relay/spec/PROTOCOL.md` and the canonical TypeScript types at `../deadworks-relay/packages/protocol/src/index.ts`.

The reference spec lives **outside** this monorepo. Always re-read it before making changes — it evolves independently.

## Authoritative Spec Sources

Treat these as the single source of truth, in priority order:

1. `../deadworks-relay/packages/protocol/src/index.ts` — canonical TS types (`ModRequirement`, `ServerListItem`, `RegistrationPayload`, `HeartbeatPayload`, `AuthConfig`, `PendingChallenge`, etc.).
2. `../deadworks-relay/spec/PROTOCOL.md` — formal protocol prose (endpoints, error codes, gossip rules, auth flow, visibility semantics).
3. `../deadworks-relay/relays.json` — bootstrap manifest example (verifies `RelaysManifest` shape).
4. `../deadworks-relay/apps/relay-server/` — reference relay implementation. Use as a sanity check, never as spec.

If `protocol/src/index.ts` and `PROTOCOL.md` disagree, prefer the TS file but flag the discrepancy to the user.

## Files Owned By This Skill

These are the files the protocol shape flows through. Update them together:

| Layer          | File                                                                      | Role                                                                                     |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Relay client   | `packages/relay-client/src/schemas.ts`                                    | Zod schemas mirroring spec response shapes                                               |
| Relay client   | `packages/relay-client/src/client.ts`                                     | HTTP calls to `/api/v1/servers`, `/api/v1/servers/{id}`, `/api/v1/relays`, `relays.json` |
| Relay client   | `packages/relay-client/src/index.ts`                                      | Re-exports                                                                               |
| Shared schemas | `packages/shared/src/schemas/server-browser.schemas.ts`                   | DMM-facing schemas (with aggregation extras like `source_relay`)                         |
| API aggregator | `apps/api/src/services/server-browser.ts`                                 | Fans out across relays, dedupes, paginates                                               |
| API resolver   | `apps/api/src/services/server-mods-resolver.ts`                           | Maps `required_mods` entries to local DMM mods                                           |
| API discovery  | `apps/api/src/services/relay-discovery.ts`                                | Loads `relays.json`, tracks per-relay health                                             |
| API router     | `apps/api/src/routers/v2/servers.ts`                                      | oRPC routes that expose the schemas                                                      |
| Desktop API    | `apps/desktop/src/lib/api.ts`                                             | Client wrappers used by the UI                                                           |
| Desktop hooks  | `apps/desktop/src/hooks/use-server-browser-data.ts`, `use-server-join.ts` | React Query hooks                                                                        |
| Desktop UI     | `apps/desktop/src/components/server-browser/**`                           | Server table, detail panel, join dialog, mods section                                    |

## Step 1: Read the Current Spec

Before any edits, read in this order:

1. `../deadworks-relay/packages/protocol/src/index.ts` (full file)
2. `../deadworks-relay/spec/PROTOCOL.md` (sections 1–12 and the auth + gossip prose)
3. The current DMM relay-client and shared schemas listed above

Compare each TS interface in `protocol/src/index.ts` to the matching Zod schema in DMM. Build a mental delta table before touching code.

## Step 2: Build the Delta Table

For every protocol type, classify it:

| Classification     | Action                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identical shape    | No change                                                                                                                                                                  |
| New optional field | Add to schema with `.optional()` (and `.default(...)` only when the spec mandates a default for absent values)                                                             |
| New required field | Add as required, propagate through aggregator/UI, plan migration for cached payloads                                                                                       |
| Renamed field      | Update schema + every consumer in one pass; do not leave shims unless explicitly requested                                                                                 |
| Removed field      | Remove from schema and every consumer; check for stale UI references (`grep` for the old name)                                                                             |
| Changed type/enum  | Update schema; check `.catch(...)` fallbacks in zod (e.g. `VisibilitySchema.catch("public")` is intentional — preserve unknown-value tolerance unless the spec narrows it) |

Present the delta table to the user before making non-trivial changes.

## Step 3: Known Recurring Drift Points

These are the fields most likely to be out of sync — check them every run:

### `required_mods[]` shape (highest churn)

Spec (`ModRequirement` in `protocol/src/index.ts`):

```ts
{ id: string; provider: "gamebanana" | "custom"; url: string; version?: string }
```

If the DMM `ModRequirementSchema` in `packages/relay-client/src/schemas.ts` and `packages/shared/src/schemas/server-browser.schemas.ts` does not match, update both. Then audit:

- `apps/api/src/services/server-mods-resolver.ts` — currently treats `req.name` as a URL and runs a `GAMEBANANA_URL_RE` regex against it. With the new shape, key off `req.provider === "gamebanana"` and parse the GameBanana ID from `req.url`. For `provider === "custom"`, the URL is a direct download — currently DMM has no resolution path for this; mark as `unknown_scheme` (or add a new reason like `custom_provider`) and surface clearly to the user.
- `ResolvedRequirementSchema` (`name`/`version` fields) — keep `name` as the human label (`req.id`) when displaying, but surface `url` and `provider` so the UI can deep-link.
- `apps/desktop/src/components/server-browser/server-detail/mods-section.tsx` and `server-row.tsx` — display `id` (or a friendly fallback derived from the URL), not the raw URL.
- `apps/desktop/src/components/server-browser/server-join/requirement-row.tsx` — the "Not in DMM" badge logic must distinguish `unknown_scheme` (custom provider) from `not_in_database`.

### `auth_config` flattening

The spec sends auth as a nested `auth_config` object on registration but **flattens** it on the public list/get response (`auth_required`, `auth_providers`, `auth_public_key`, `auth_prompt_message`, `auth_prompt_url`). DMM consumes only the flattened form. Verify this is still true on each spec sync.

### `gateway_url`

Top-level on both registration and list responses. DMM already honors this in `server-join/join-action.ts` (opens externally, takes precedence over connect code). Do not regress that ordering.

### Visibility enum

Spec set: `public`, `unlisted`, `private`, `password`. Server lists only return `public` and `password` (per §5). DMM keeps the full enum since `getServer(id)` may return `unlisted`. Preserve `.catch("public")` to tolerate future additions from older clients.

### `relays.json`

Schema is `{ version: 1, relays: [{ url, region? }] }`. `RelaysManifestSchema` must use `z.literal(1)` for the version field.

## Step 4: Apply Changes In Layers

Work outside-in. Do **not** start from the UI; types must flow downward.

1. **Relay client schemas** (`packages/relay-client/src/schemas.ts`)
   - Mirror the spec exactly. This package is the boundary with the relay mesh.
   - Use `.optional().default(...)` for fields the spec marks optional with a documented default; use plain `.optional()` otherwise.
   - Run `pnpm --filter @deadlock-mods/relay-client build` (or `tsgo --noEmit`) to type-check.
2. **Relay client transport** (`packages/relay-client/src/client.ts`)
   - Add/remove methods to match new endpoints (e.g. if events, auth challenge, or gossip endpoints become client-relevant).
   - Keep the circuit breaker and retry behavior — those are DMM concerns, not protocol.
3. **Shared schemas** (`packages/shared/src/schemas/server-browser.schemas.ts`)
   - The DMM-facing schema extends the relay shape with aggregation fields (`source_relay`, `source_region`). Keep those.
   - Mirror any field additions/renames from the relay schemas.
4. **API services** (`apps/api/src/services/*.ts`)
   - `server-browser.ts`: dedup logic keys on `id`; touch only if pagination/sorting fields change.
   - `server-mods-resolver.ts`: rewrite parser whenever `ModRequirement` shape changes (see drift section above).
   - `relay-discovery.ts`: only changes if `relays.json` shape or `/api/v1/relays` shape changes.
5. **API router** (`apps/api/src/routers/v2/servers.ts`)
   - oRPC types are derived from the schemas, so this rarely changes — but rebuild types and check the output.
6. **Desktop API client** (`apps/desktop/src/lib/api.ts`)
   - Type imports flow from `@deadlock-mods/shared`. If schemas were renamed, update imports.
7. **Desktop hooks and components**
   - Find every component that reads a changed field: `rg "required_mods\.|server\.auth_|gateway_url|connect_code|password_protected" apps/desktop/src/components/server-browser`
   - Update display logic. Respect i18n: any new user-facing string must go through `react-i18next` (see `apps/desktop/src/locales/`).

## Step 5: Cache & Compatibility

The API aggregator caches list/detail responses in Redis (`CACHE_TTL.SERVERS_LIST`, `CACHE_TTL.SERVER_DETAIL`, `CACHE_TTL.SERVERS_FACETS`). When response shape changes:

- Bump cache key versions in `apps/api/src/services/server-browser.ts` (`buildListCacheKey`, the literal `server-browser:detail:` and `server-browser:facets`) — e.g. `server-browser:v2:detail:`. This avoids serving stale payloads parsed against the new schema.
- Document the bump in the changeset.

## Step 6: Verify

Run each of these and fix issues before stopping:

```bash
pnpm --filter @deadlock-mods/relay-client check-types
pnpm --filter @deadlock-mods/shared check-types
pnpm --filter @deadlock-mods/api check-types
pnpm --filter @deadlock-mods/desktop check-types
pnpm lint:fix
pnpm format:fix
```

Then exercise the path manually if changes are user-visible:

1. Start the local relay sim per `../deadworks-relay/README.md`:
   ```bash
   cd ../deadworks-relay && bun install && bun run sim:dev
   ```
2. Point DMM API at it (`RELAYS_JSON_URL=http://127.0.0.1:3000/relays.json` or the local seed file).
3. Open the server browser tab in the desktop app and confirm:
   - List renders, region/game-mode/password filters work.
   - Detail panel shows mods, required mods, players.
   - Join action: gateway URL opens externally if present; otherwise connect code copies.
   - Auth-protected servers show the shield icon and prompt message.

If the relay sim is not available, at minimum write a Vitest case that parses a fixture payload generated from `../deadworks-relay/packages/protocol/src/index.ts` types.

## Step 7: Changeset

Per `.cursor/rules/090-changesets.mdc`, create a changeset for any user-visible change. Use a `minor` bump if the public DMM API client surface changes; `patch` otherwise.

Example body:

```
Sync relay client and server browser with Deadworks Relay protocol v1
spec at <commit-or-date>. Updates `required_mods` shape to
`{ id, provider, url, version }` and adjusts the resolver to parse
GameBanana IDs from `url` instead of `name`. Bumps server browser
cache keys to invalidate stale Redis payloads.
```

## Hard Rules

- NEVER read the deadworks-relay TS sources by guessing — always re-read `protocol/src/index.ts` and `spec/PROTOCOL.md` at the start of the task. The spec evolves between runs of this skill.
- NEVER rename a field in only one layer. If `required_mods[].id` changes, update the relay-client schema, shared schema, resolver, and every UI consumer in the same change.
- NEVER weaken validation by switching strict zod fields to `z.any()` to silence type errors. If the spec genuinely allows arbitrary shape, use `z.unknown()` and gate consumers explicitly.
- NEVER drop the `source_relay` / `source_region` fields from the DMM-facing schemas — those are DMM's aggregation metadata, not part of the relay spec.
- NEVER hand-edit anything inside `../deadworks-relay/`. It is a sibling repo and not part of this workspace.
- ALWAYS bump cache key versions (Step 5) when response shape changes. Stale Redis payloads parsed against a new zod schema will break the API.
- ALWAYS run the `check-types` commands in Step 6 before declaring done.
