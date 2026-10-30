import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createInstance } from "i18next";
import en from "@/locales/en.json";

const i18n = createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: en } },
  showSupportNotice: false,
});

const SOURCES = [
  "hooks/use-download.ts",
  "hooks/use-deep-link.ts",
  "hooks/use-collection-download.ts",
  "lib/download/manager.ts",
];

const TRANSLATION_CALL_REGEX = /\bt\(\s*"([\w.]+)"/g;
const LITERAL_TOAST_REGEX = /\btoast\.\w+\(\s*[`"']/g;

describe("download notifications", () => {
  for (const file of SOURCES) {
    it(`${file} only uses translation keys that exist`, async () => {
      const source = await Bun.file(join(import.meta.dir, "..", file)).text();
      const keys = Array.from(
        source.matchAll(TRANSLATION_CALL_REGEX),
        ([, key]) => key,
      );

      expect(keys.length).toBeGreaterThan(0);
      const missing = keys.filter(
        (key) => !i18n.exists(key) && !i18n.exists(key, { count: 2 }),
      );

      expect(missing).toEqual([]);
    });

    it(`${file} passes no untranslated text to a toast`, async () => {
      const source = await Bun.file(join(import.meta.dir, "..", file)).text();

      const lines = Array.from(
        source.matchAll(LITERAL_TOAST_REGEX),
        ({ index }) => `${file}:${source.slice(0, index).split("\n").length}`,
      );

      expect(lines).toEqual([]);
    });
  }
});
