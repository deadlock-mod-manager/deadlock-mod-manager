# Website translations

The public site (deadlockmods.app) is translated with i18next. English is the
source; Crowdin manages the other languages, the same way it does for the
desktop app.

```
src/locales/
  en/<namespace>.json       source strings (edit these)
  ru-RU/<namespace>.json    translations (Crowdin writes these)
  pt-BR/ pl-PL/ de-DE/ fr-FR/ es-ES/
```

Only edit files under `en/`. Translations are drafted once, then reviewed and
maintained in Crowdin (translate.deadlockmods.app); the Crowdin workflow opens
PRs with updates. A key missing or empty in a translation falls back to English.

## Languages and URLs

Defined in `src/lib/i18n/locales.ts`. English stays at unprefixed URLs, other
languages get a prefix: `/ru/mods`, `/pt-br/download`. Routes are declared
once; the router's `rewrite` option in `src/router.tsx` strips and re-adds the
prefix, so `<Link to='/download' />` automatically points at the current
language. Only pages in `LOCALIZED_PATHS` are translated; legal pages and the
dashboard stay English-only.

## Namespaces

One JSON file per area, registered in `src/lib/i18n/instance.ts` (`NAMESPACES`)
and `src/types/i18next.d.ts`, which makes keys type-checked against English.

| Namespace | Covers |
| --- | --- |
| `common` | navbar, footer, language switcher, CTAs, guide layout, fallbacks, guide labels |
| `home` | home page sections and FAQ |
| `preview` | the interactive app preview on the home page |
| `download` | download pages |
| `tool-*` | randomizer, crosshair generator, VPK analyzer, KV parser |
| `guide-*`, `error-*` | one per guide or error page |
| `v2` | the "What's new in V2" page |

## Writing strings

- Components: `const { t } = useTranslation("guide-mods");` then `t("hero.title")`.
- `head()` runs outside React; use `headI18n(match, "guide-mods")` from
  `src/lib/i18n/route.ts` to get `t` and `locale`, and pass `locale` to
  `seo()` / `guideHead()`.
- Links, code and emphasis inside a sentence use `<Trans>` with named tags,
  never string concatenation:

  ```tsx
  <Trans t={t} i18nKey='steps.download' components={{ link: <Link to='/download' />, code: <code /> }} />
  ```
  ```json
  "download": "Get it from the <link>download page</link>, then open <code>gameinfo.gi</code>."
  ```
- Lists (FAQs, steps, cards) are objects keyed by a stable id, not arrays:
  `"faqs": { "free": { "question": "…", "answer": "…" } }`. Read them with
  `t("faqs", { returnObjects: true })` and `Object.values`.
- Avoid count-based plurals; Russian and Polish need more forms than Crowdin
  currently produces. Prefer wording that works for any number.
- Don't translate product names (Deadlock, Deadlock Mod Manager, GameBanana,
  Grimoire, Mod Foundry), file names, paths, console commands or error text
  the game prints in English. UI labels that match the desktop app use the
  desktop's wording.
- Numbers: `useNumberFormat()` from `src/lib/i18n/route.ts`.
