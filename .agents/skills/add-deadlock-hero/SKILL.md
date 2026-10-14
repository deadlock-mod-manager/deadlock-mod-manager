---
name: add-deadlock-hero
description: Wire a new Deadlock hero into every surface of the monorepo - shared enum and title matching, VPK hero parser, GameBanana registry, Foundry tables and cards, Discord Rich Presence, hero pickers and the website randomizer. Use when Valve releases or announces heroes, a hero shows a letter instead of a portrait, or mods for a new hero are not detected.
---

# Add a Deadlock hero

A hero lives under several **codenames** that diverge from each other and from its display name (Abrams is `atlas` in `class_name`, `bull` in portrait art, `abrams` in models and sounds). Every table below is keyed by one of them, so the job is: collect the codenames once, then enter them in each table. The reference commit is `2f18d23e` (the six 2026-09-29 heroes); `git show 2f18d23e` shows the full pattern.

## 1. Build the identity sheet

Fetch the hero from the assets API (the old `assets.deadlock-api.com` host is gone):

```sh
curl -s "https://api.deadlock-api.com/v1/assets/heroes?language=english&only_active=false"
curl -s "https://api.deadlock-api.com/v1/assets/items/by-type/ability?language=english"
```

Fill in, per hero:

| Field | Source |
| --- | --- |
| Display name | API `name` |
| Enum key | PascalCase of the name, no spaces or `&` (`RatKing`, `DeadmanDanny`) |
| Class codename | API `class_name` minus `hero_` (`ratking`) |
| Model dir | `models/heroes_wip/<dir>/` in the API `models.hero_select` URL, confirmed in `pak01_dir.vpk` |
| Panorama codename | `panorama/images/heroes/<codename>_*` in `pak01_dir.vpk` |
| Sound codename | `sounds/abilities/<codename>/` in `pak01_dir.vpk` |
| Ability slots 1-4 | Hero `items.signature1..4` → ability `class_name` + `name` |
| Portrait | `images.icon_image_small` (128×128) and `images.icon_hero_card` (280×380) |
| Hideout text | `hideout_rich_presence` |
| Release state | `player_selectable`, `disabled`, `development_state` |

Completion criterion: every field is filled or explicitly marked "not shipped yet" (pre-release heroes have no portraits or abilities), and every codename was checked against `pak01_dir.vpk`, not guessed from the name.

## 2. Edit every hard-coded table

Work through the list in order; each item is a file you open and edit.

**Shared hero identity** (`@deadlock-mods/shared`)
- `packages/shared/src/constants.ts` - add the enum member to `DeadlockHeroes`, alphabetical.
- `packages/shared/src/heroes/constants.ts` - add a `HERO_DEFINITIONS` entry: codenames as `aliases`, multi-word names as `phrases`. A codename that is a common English word (`nurse`, `artist`) is **not** an alias - it would steal mod titles; leave a comment saying so.
- `packages/shared/src/tests/heroes.spec.ts` - cover `normalizeHero` for the codename/alias and `guessHero` for a realistic mod title, plus a negative case for any common-word codename.
- Check that the API `name` resolves through `normalizeHero` (API says "The Doorman", the enum says "Doorman"); add an alias when it does not, or the hero catalog lookup misses.

**VPK hero parser** (`@deadlock-mods/hero-parser`) - both implementations, kept identical:
- `packages/hero-parser/src/mapping.ts` - `HERO_MAP`: `<model dir>: { enumKey, displayName }`.
- `packages/hero-parser/src-rs/mapping.rs` - the same row as `("<model dir>", "<EnumKey>", "<Display>")`.
- Add `_v2`-style variants of the model dir when the VPK ships them.

**GameBanana registry** (desktop Rust)
- Regenerate, never hand-edit: `pnpm --filter @deadlock-mods/desktop generate:gamebanana-heroes` rewrites `providers/gamebanana/generated_hero_registry.rs` from `HERO_DEFINITIONS`.
- `apps/desktop/src-tauri/src/providers/gamebanana/hero_registry.rs` - extend the tests (`normalize`, `guess`, skin-category resolution).

**Mod Foundry** (`apps/desktop/src-tauri/src/commands/foundry/`)
- `hero.rs` `panorama_codenames` - `"<Display>" => vec!["<panorama codename>", ...legacy]`.
- `hero.rs` `default_model_codenames` - only when the model dir does not fall out of the display name.
- `hero.rs` `HERO_SOUND_CODENAMES` - `("<sound codename>", "<Display>")`.
- `hero-ability-slots.json` - `slots.<sound codename>.1..4` with `token` = ability `class_name` minus `ability_<codename>_` (keep underscores) and `display` = ability `name`; slot 4 is the ultimate. Write it with 2-space JSON, keys sorted, so the diff stays additive.
- `apps/desktop/public/foundry/default-skins/cards/<snake_name>.png` - 280×380 card. Use `icon_hero_card`; if the API has none yet, crop the release-vote poster (what `2f18d23e` did).
- `apps/desktop/src/lib/foundry-default-skins.ts` - `{ hero: "<Display>", image: cardPath("<snake_name>") }`, alphabetical.
- `packages/source2-model/src/rest_pose.rs` `WEAPON_HOLD_CLIPS` - only if the Foundry preview holds the weapon wrong; pick the clip by eye.

**Discord Rich Presence** (`packages/deadlock-discord-presence/src-rs/hero_data.rs`)
- Live data comes from the API at runtime; the table to edit is `fallback_heroes()`, used when the API and cache are both unavailable.
- Key = the codename the game log reports: the model dir (`patterns.rs` reads `models/heroes(_wip|_staging)?/<dir>/`). Row: display name, `hideout_rich_presence`, `hero_<class codename>`, and the portrait stem - the file name of `icon_image_small` minus `_sm.png`, which often differs from the codename (Abrams → `bull`). Use `None` while there is no portrait.
- Extend `knows_the_city_never_sleeps_heroes_without_the_api` (or add a sibling test) for the new keys.

**Fixtures and release notes**
- `apps/desktop/e2e/support/content-fixtures.ts` - add the name to `heroNames`.
- `.changeset/<slug>.md` - patch bumps for `@deadlock-mods/desktop`, `@deadlock-mods/shared`, `@deadlock-mods/hero-parser` (add `deadlock-discord-presence` when touched), one user-facing sentence.

Completion criterion: `rg -i "<class codename>|<Display name>"` hits every file listed above, and nothing in the list was skipped without a written reason (for example "model dir follows the display name, no `default_model_codenames` entry").

## 3. Confirm the API-driven surfaces

These read the assets API and need no edit - confirm the hero shows up instead:

- Desktop portraits (`components/heroes/hero-icon.tsx`), Stats, Skins page and every hero picker load `/v1/assets/heroes?only_active=true` through `useHeroCatalog`.
- `useIsHeroAvailable` (`apps/desktop/src/hooks/use-player-stats.ts`) hides a hero from pickers (Skins, Foundry default skins, mod hero filter, hero override, crosshair form) until the active catalog lists it with a portrait. A pre-release hero is therefore fully wired but invisible; it appears on its own once Valve releases it. Keep that gating - add the hero to the tables anyway.
- Website randomizer (`apps/www/src/lib/deadlock-assets.ts`) keeps heroes that are `player_selectable && !disabled`. Do not filter on `in_development`: Valve leaves it set on released heroes (Baba).
- The homepage app preview (`apps/www/src/components/home/app-preview/`) and the crosshair overrides (`packages/crosshair`) are curated subsets, not rosters; touch them only on purpose.

## 4. Verify

```sh
pnpm --filter @deadlock-mods/shared test -- --run
cargo test --manifest-path packages/hero-parser/Cargo.toml
cargo test --manifest-path packages/deadlock-discord-presence/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- foundry gamebanana
pnpm check-types && pnpm lint:fix && pnpm format:fix
```

`cargo test` in `src-tauri` rewrites `apps/desktop/src/types/generated/*.ts` unformatted; run `pnpm exec oxfmt --write apps/desktop/src/types/generated` before reading the diff, so only real changes remain.

With the dev app running, check through tauri-mcp-server that the hero has a portrait on the Skins page and in the Foundry default skins, or is hidden there while pre-release.

Done when all commands pass, the diff touches every file from step 2 (or carries the written skip reason), and the hero renders with a portrait - or is hidden because it has none yet - in the running app.
