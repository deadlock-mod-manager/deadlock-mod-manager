# Sync Translations

Check and sync all locale files so they have the same keys as the English locale. English (`en.json`) is the source of truth.

## Instructions

### 1. Check Current State (Optional)

To see which locales are missing keys before syncing, from the repo root:

- Read `apps/desktop/src/locales/en.json` and collect all keys (including nested, as dot paths, e.g. `navigation.dashboard`, `myMods.tabs.all`).
- For each locale file `apps/desktop/src/locales/<code>.json` (skip `en.json`), collect its keys the same way.
- For each locale, list keys that exist in English but are missing in that locale. Report by locale (e.g. "de: missing X, Y, Z").

Locales to check: `ar`, `bg`, `de`, `de-CH`, `es`, `fr`, `it`, `ja`, `pl`, `pt-BR`, `ru`, `th`, `tr`, `zh-CN`, `zh-TW`.

### 2. Run Sync Script

From the **repository root**:

```bash
bun scripts/sync-translations.ts
```

This will:

- Use `apps/desktop/src/locales/en.json` as the source.
- For each language in the script’s `LANGUAGE_CODES`, add any missing keys (with the English value) and keep existing translations. Keys are sorted.

### 3. Include All Locales in the Script

The script’s `LANGUAGE_CODES` in `scripts/sync-translations.ts` must include every locale that has a `<code>.json` file (so they are all synced). At least `bg` is in `apps/desktop/src/locales/` but may be missing from `LANGUAGE_CODES`; if so, add it so all non-English locales are synced.

### 4. Verify After Sync

After running the script:

- Confirm no run errors.
- Optionally re-run the check from step 1 to confirm every locale has the same key set as English.

## Key Points

- Source of truth: `apps/desktop/src/locales/en.json`.
- Sync adds missing keys with the English string; existing translations are never overwritten.
- Nested keys are merged recursively; key order is normalized (sorted).
- Run the script from the repo root so paths in the script resolve correctly.

## Example Usage

**User:** "sync translations", "check locale keys", or `/sync-translations`

**Response:**

1. Optionally report which locales are missing which keys (step 1).
2. Run `bun scripts/sync-translations.ts` (step 2).
3. If `LANGUAGE_CODES` is missing any locale (e.g. `bg`), update the script (step 3).
4. Confirm sync completed and optionally verify keys (step 4).

## Related Files

- `scripts/sync-translations.ts` – Sync script (adds missing keys from English to all listed locales).
- `apps/desktop/src/locales/en.json` – Source locale.
- `apps/desktop/src/locales/<code>.json` – Target locales.
