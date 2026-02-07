# Translate Missing

Find hardcoded user-facing strings in desktop React files that are not using the translation hook, then add them as keys to the English locale and replace usages with `t()`.

## Scope

- **Target:** All React files under `apps/desktop/src` (`.tsx` and `.jsx`).
- **Source of truth:** `apps/desktop/src/locales/en/translation.json`. Add new keys there only.
- **Hook in use:** `useTranslation` from `react-i18next`; usage is `const { t } = useTranslation();` then `t("some.key")`.

## What Counts as “Hardcoded” (Candidate for Translation)

- String literals in JSX that are visible to the user (labels, buttons, titles, descriptions, placeholders, messages, toasts).
- `title`, `aria-label`, `placeholder`, and similar attribute values that are user-facing.
- Strings passed to toast/notification APIs or error messages shown in the UI.
- Confirm/cancel dialog text.

## What to Skip

- Strings already inside `t("...")` or `t(\`...\`)`.
- date-fns format strings (e.g. `"PP"`, `"PPP"`, `"MMM d, yyyy"`) used only as format patterns.
- Import paths, file extensions, and technical identifiers.
- Comments and strings used only in logic (e.g. comparison values, keys for data).
- Empty strings.
- Strings that are clearly not UI (URLs, env vars, internal error codes not shown as-is to the user).

## Instructions

### 1. Find Hardcoded Strings

- Search under `apps/desktop/src` in `.tsx`/`.jsx` for string literals in JSX and in user-facing props.
- Ignore files that only use `t()` for all visible text.
- List each hardcoded string with file path and (if useful) line or component name.

### 2. Choose Key Names and Location

- Use the existing nested structure in `apps/desktop/src/locales/en/translation.json` (e.g. `navigation.dashboard`, `myMods.tabs.all`).
- Prefer a key path that matches the feature/screen (e.g. `mods.deleteConfirmTitle`).
- Use camelCase for key segments.
- If a section does not exist, add a new top-level or nested section; keep keys sorted within their block.

### 3. Add Keys to English Locale

- In `apps/desktop/src/locales/en/translation.json`, add each new key with the current hardcoded string as the value.
- Preserve JSON structure and formatting style (indentation, no trailing commas).
- Do not remove or change existing keys.

### 4. Replace in React Code

- In each React file, ensure `useTranslation` is imported and `const { t } = useTranslation();` is used (e.g. inside the component).
- Replace each hardcoded string with `t("the.new.key")` using the key added in step 3.
- For dynamic parts, use interpolation: `t("key", { name: value })` and in the JSON use `"text {{name}} more text"`.

### 5. Sync Other Locales (Optional)

- After updating English, you can run the sync-translations command so other locale files get the new keys (with English value as placeholder). See `.cursor/commands/sync-translations.md`.

## Key Points

- Only add keys to `apps/desktop/src/locales/en/translation.json`; do not edit other locale files in this command except via sync-translations if desired.
- Every new key must be used in code via `t("key")` (or equivalent) so the string is no longer hardcoded.
- Keep key names consistent with existing style and nesting in the English file.

## Example Usage

**User:** “translate missing”, “find untranslated strings”, or `/translate-missing`

**Response:**

1. Scan desktop React files and list hardcoded user-facing strings.
2. Add new keys to `en/translation.json` with those strings as values.
3. Replace each hardcoded string in the React files with `t("new.key")`.
4. Optionally suggest running sync-translations to propagate keys to other locales.

## Related Files

- `apps/desktop/src/locales/en/translation.json` – English locale (add keys here).
- `.cursor/commands/sync-translations.md` – Sync keys to other locales after adding to English.
