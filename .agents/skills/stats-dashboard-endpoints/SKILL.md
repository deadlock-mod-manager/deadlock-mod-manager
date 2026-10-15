---
name: stats-dashboard-endpoints
description: Check every deadlock-api endpoint the customizable Stats dashboard uses and update the dashboard when one has changed, moved, been deprecated or stopped returning data. Use when asked to "check dashboard endpoints", "are the stats widgets still working", "update dashboard presets", "deadlock-api changed", when users report broken Stats widgets, or before a release that touches the Stats page.
---

# Check and Update Stats Dashboard Endpoints

The Stats dashboard (`/stats`) reads from the community API at `api.deadlock-api.com`. That API changes without notice. This skill finds every endpoint the dashboard depends on, verifies it against the live API and its OpenAPI document, and repairs whatever drifted.

## Files Owned By This Skill

| File | Role |
| --- | --- |
| `apps/desktop/src/lib/stats/dashboard/catalog.ts` | The presets: endpoint, request path, required response fields (zod), dataset fields, default view. Header comment carries the "last checked" date. |
| `apps/desktop/src/lib/stats/dashboard/api-query.ts` | `API_EXAMPLES` for the API query editor, path placeholders, response flattening. |
| `apps/desktop/src/lib/stats/dashboard/endpoints.live.test.ts` | The live check. Off unless `DASHBOARD_LIVE=1`. |
| `apps/desktop/src/locales/en.json` → `stats.dashboard` | Titles, descriptions and field labels for presets (`presets.<group>.<name>`, `fields.<key>`). |
| `apps/desktop/e2e/support/stats-dashboard-fixtures.ts` | Fixture responses the E2E scenario serves in place of deadlock-api. |
| `apps/desktop/src/lib/stats/api.ts`, `src/lib/validation/stats-api.ts` | The Stats page's own requests. The panels use them, and some presets reuse them (`getItemStats`, `getSteamProfiles`). |

## Step 1: Run the Live Check

```powershell
pnpm --filter @deadlock-mods/desktop check:dashboard-endpoints
```

It picks an active account from the player scoreboard. Set `DASHBOARD_ACCOUNT_ID` to test a specific one. It then:

1. Loads every preset in `PRESETS` with its default parameters and asserts rows, the fields the default view plots, and at least one plottable value.
2. Resolves and loads every `API_EXAMPLES` entry and asserts it yields something numeric to chart.
3. Matches every request path against `/openapi.json`: the path must exist, its GET must not be deprecated, and every query parameter sent must still be declared.

A green run means nothing to do. Report that and stop, unless the "last checked" date in `catalog.ts` is old enough to be worth bumping.

## Step 2: Classify Each Failure

Read the OpenAPI entry for every failing endpoint before you change any code:

```powershell
curl.exe -s https://api.deadlock-api.com/openapi.json -o $env:TEMP\deadlock-openapi.json
```

Then request the endpoint with a real account and compare the response to the preset's zod schema.

| Symptom in the check | Likely cause | Fix |
| --- | --- | --- |
| `HTTP 404` | Endpoint moved or was removed | Find the replacement in OpenAPI and update the path and `endpoint` string. If nothing replaces it, remove the preset (see Step 4). |
| `HTTP 400` / `no longer accepts ?x` | A query parameter was renamed or dropped | Rename it in the request path. Change preset params only if a parameter's meaning changed. |
| `is deprecated` | Still works, but has an announced replacement | Move to the replacement now. The description usually names it. |
| `DashboardSchemaError` | A required response field was renamed, retyped or dropped | Update the preset's zod schema and its row mapping. Never make the field optional with a default just to get the test green: the required fields are what turn a changed API into a visible "broken" widget instead of silent zeros. |
| `missing <field>` | The preset builds rows without a field its default view uses | Fix the row mapping or the default `view`. |
| `no rows` / `no row has a value` | Wrong parameter or filter, or the data moved to another field | Inspect the raw response. A filter like `min_matches` may need loosening. |
| An API example fails | Same causes as above | Update the entry in `API_EXAMPLES` and its label under `stats.dashboard.api.examples`. |

`HTTP 429` or network errors are not drift. Wait and rerun before changing anything.

## Step 3: Update the Dashboard

- Change only what drifted. Keep preset ids stable: users' saved layouts reference them.
- Keep every field a preset reads required in its schema. Optional is right only when the API itself documents the field as nullable, as `buff-stats` does for its timing fields.
- When a field is renamed, keep the dataset field key the same if the meaning is unchanged. Saved widgets reference dataset keys in `view.x`, `view.y` and `view.sortBy`, and a renamed key shows those widgets as broken ("fields").
- New dataset keys need a label under `stats.dashboard.fields` in `en.json`. Run the key check described in Step 5.
- If an endpoint's response shape changed, update the matching fixture in `e2e/support/stats-dashboard-fixtures.ts` so the E2E scenario still mirrors the real API.
- Bump the "Last checked against the live API" date in the `catalog.ts` header.

## Step 4: Removing a Preset

Remove a preset only when the API has no replacement. Saved widgets that use it will render the "no longer available" notice, which is the intended behavior. Still:

1. Delete the preset from `catalog.ts`, delete its `stats.dashboard.presets.*` strings, and delete fields that no other preset uses.
2. Remove it from tab templates in `lib/stats/dashboard/templates.ts` and from the default layout if either references it.
3. Tell the user which preset went away and why. This change is visible to users.

## Step 5: Verify

Run all of these and report the results:

```powershell
pnpm --filter @deadlock-mods/desktop check:dashboard-endpoints
pnpm --filter @deadlock-mods/desktop exec bun test src/lib/stats
pnpm --filter @deadlock-mods/desktop check-types
pnpm exec oxlint apps/desktop/src/lib/stats apps/desktop/src/components/stats
```

If the E2E build is available, run the dashboard scenario as well:

```powershell
pnpm --filter @deadlock-mods/desktop e2e:test -- --suite stats
```

For translation keys, check that every `stats.dashboard.presets.*`, `fields.*` and `api.examples.*` key the code uses exists in `en.json`. Preset ids contain a dot (`you.summary`), and i18next reads dots as nesting, so the strings live at `presets.you.summary.title`.

## Rules

- Do not switch the dashboard to `/v1/sql`. It is deprecated and limited to 2 requests per minute.
- Do not add endpoints marked Patreon-only or rate-limited below 100 req/min per IP. `lib/stats/api.ts` lists the ones the app avoids.
- Do not hide failures with `.catch()` or default values in the zod schemas. A broken widget with an endpoint name is the designed failure mode.
- Do not commit. Leave the changes for the user to review.
