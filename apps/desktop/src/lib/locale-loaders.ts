import type { ResourceKey } from "i18next";

/**
 * Every language except English, each built as its own chunk and loaded only
 * when it's the detected or chosen language. Adding a language here also makes
 * i18next accept it.
 *
 * These imports live outside i18n.ts on purpose: Vite rewrites a module's
 * dynamic imports and drops the `with { type: "json" }` on that module's
 * static en.json import, which makes Rollup warn about mismatched attributes.
 */
export const localeLoaders = new Map<
  string,
  () => Promise<{ default: ResourceKey }>
>([
  ["de-DE", () => import("@/locales/de-DE.json")],
  ["fr-FR", () => import("@/locales/fr-FR.json")],
  ["ar-SA", () => import("@/locales/ar-SA.json")],
  ["pl-PL", () => import("@/locales/pl-PL.json")],
  ["de-CH", () => import("@/locales/de-CH.json")],
  ["th-TH", () => import("@/locales/th-TH.json")],
  ["tr-TR", () => import("@/locales/tr-TR.json")],
  ["ru-RU", () => import("@/locales/ru-RU.json")],
  ["zh-CN", () => import("@/locales/zh-CN.json")],
  ["zh-TW", () => import("@/locales/zh-TW.json")],
  ["es-ES", () => import("@/locales/es-ES.json")],
  ["pt-BR", () => import("@/locales/pt-BR.json")],
  ["it-IT", () => import("@/locales/it-IT.json")],
  ["ja-JP", () => import("@/locales/ja-JP.json")],
  ["ko-KR", () => import("@/locales/ko-KR.json")],
  ["bg-BG", () => import("@/locales/bg-BG.json")],
  ["be-BY", () => import("@/locales/be-BY.json")],
]);
