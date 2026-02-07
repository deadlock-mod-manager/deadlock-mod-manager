# Sync Translations

Check and sync all locale files so they have the same keys as the English locale. English (`en/translation.json`) is the source of truth.

## Instructions

### 1. Check Current State (Optional)

To see which locales are missing keys before syncing, from the repo root:

- Read `apps/desktop/src/locales/en/translation.json` and collect all keys (including nested, as dot paths, e.g. `navigation.dashboard`, `myMods.tabs.all`).
- For each locale in `apps/desktop/src/locales/` (skip `en` and `template`), read that locale’s `translation.json` and collect its keys the same way.
- For each locale, list keys that exist in English but are missing in that locale. Report by locale (e.g. "de: missing X, Y, Z").

Locales to check: `ar`, `bg`, `de`, `es`, `fr`, `gsw`, `it`, `ja`, `pl`, `pt-BR`, `ru`, `th`, `tr`, `zh-CN`, `zh-TW`.

### 2. Run Sync Script

From the **repository root**:

```bash
bun scripts/sync-translations.ts
```

This will:

- Use `apps/desktop/src/locales/en/translation.json` as the source.
- For each language in the script’s `LANGUAGE_CODES`, add any missing keys (with the English value) and keep existing translations. Keys are sorted.

### 3. Include All Locales in the Script

The script’s `LANGUAGE_CODES` in `scripts/sync-translations.ts` must include every locale that has a `translation.json` (so they are all synced). At least `bg` is in `apps/desktop/src/locales/` but may be missing from `LANGUAGE_CODES`; if so, add it so all non-English, non-template locales are synced.

### 4. Template Locale (Optional)

`apps/desktop/src/locales/template/template.json` uses a different filename (`template.json`). The current script only handles `translation.json`. To keep the template in sync with English keys, either:

- Add a separate step in the script that syncs `template/template.json` from English (same key structure, values can be empty), or
- Manually update the template when you run this command.

### 5. Verify After Sync

After running the script:

- Confirm no run errors.
- Optionally re-run the check from step 1 to confirm every locale has the same key set as English.

## Key Points

- Source of truth: `apps/desktop/src/locales/en/translation.json`.
- Sync adds missing keys with the English string; existing translations are never overwritten.
- Nested keys are merged recursively; key order is normalized (sorted).
- Run the script from the repo root so paths in the script resolve correctly.

## Example Usage

**User:** "sync translations", "check locale keys", or `/sync-translations`

**Response:**

1. Optionally report which locales are missing which keys (step 1).
2. Run `bun scripts/sync-translations.ts` (step 2).
3. If `LANGUAGE_CODES` is missing any locale (e.g. `bg`), update the script (step 3).
4. Confirm sync completed and optionally verify keys (step 5).

## Related Files

- `scripts/sync-translations.ts` – Sync script (adds missing keys from English to all listed locales).
- `apps/desktop/src/locales/en/translation.json` – Source locale.
- `apps/desktop/src/locales/*/translation.json` – Target locales.
