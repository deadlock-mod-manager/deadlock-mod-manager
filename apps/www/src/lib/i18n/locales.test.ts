import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "./instance";
import {
  delocalizePath,
  isLocalizedPath,
  LOCALES,
  localizePath,
  matchAcceptLanguage,
} from "./locales";

describe("locale paths", () => {
  it("prefixes translated pages and leaves English and legal pages alone", () => {
    expect(localizePath("/mods", "ru")).toBe("/ru/mods");
    expect(localizePath("/", "pt-BR")).toBe("/pt-br");
    expect(localizePath("/mods", "en")).toBe("/mods");
    expect(localizePath("/privacy", "de")).toBe("/privacy");
  });

  it("strips a known prefix only in front of a translated page", () => {
    expect(delocalizePath("/ru/mods")).toEqual({ locale: "ru", path: "/mods" });
    expect(delocalizePath("/pt-br")).toEqual({ locale: "pt-BR", path: "/" });
    expect(delocalizePath("/ru/privacy")).toEqual({
      locale: null,
      path: "/ru/privacy",
    });
    expect(delocalizePath("/mods")).toEqual({ locale: null, path: "/mods" });
  });

  it("treats a trailing slash like the bare path", () => {
    expect(isLocalizedPath("/download/")).toBe(true);
  });
});

describe("matchAcceptLanguage", () => {
  it("honours q-values and region subtags", () => {
    expect(matchAcceptLanguage("en-US,en;q=0.9,ru;q=0.8")).toBe("en");
    expect(matchAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(matchAcceptLanguage("de;q=0.5,fr;q=0.9")).toBe("fr");
    expect(matchAcceptLanguage("pt-PT")).toBe("pt-BR");
  });

  it("does not map neighbouring languages onto Russian", () => {
    expect(matchAcceptLanguage("uk-UA,uk;q=0.9")).toBeNull();
    expect(matchAcceptLanguage("be")).toBeNull();
    expect(matchAcceptLanguage("")).toBeNull();
  });
});

const localesDir = join(__dirname, "..", "..", "locales");

/** Locale files are nested objects whose leaves are strings. */
interface LocaleTree {
  [key: string]: string | LocaleTree;
}

type FlatLocale = Record<string, string>;

const flatten = (tree: LocaleTree, prefix = ""): FlatLocale =>
  Object.entries(tree).reduce<FlatLocale>((acc, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return Object.assign(
      acc,
      child instanceof Object ? flatten(child, path) : { [path]: child },
    );
  }, {});

const read = (folder: string, ns: string): FlatLocale => {
  const file = join(localesDir, folder, `${ns}.json`);
  return flatten(JSON.parse(readFileSync(file, "utf8")) as LocaleTree);
};

const tokens = (text: string) =>
  [...text.matchAll(/\{\{\s*[\w.]+\s*\}\}|<\/?[\w-]+>/g)]
    .map((match) => match[0].replace(/\s/g, ""))
    .sort();

describe("translation files", () => {
  it("has an English file for every namespace", () => {
    const english = readdirSync(join(localesDir, "en")).map((file) =>
      file.replace(/\.json$/, ""),
    );
    expect(english.sort()).toEqual([...NAMESPACES].sort());
  });

  for (const locale of LOCALES.filter((entry) => entry.id !== "en")) {
    const folder = join(localesDir, locale.file);
    let files: string[] = [];
    try {
      files = readdirSync(folder);
    } catch {
      files = [];
    }

    for (const file of files) {
      const ns = file.replace(/\.json$/, "");
      it(`${locale.file}/${file} only uses English keys, placeholders and tags`, () => {
        const source = read("en", ns);
        const translated = read(locale.file, ns);
        for (const [key, text] of Object.entries(translated)) {
          expect(source, `unknown key ${key}`).toHaveProperty([key]);
          if (text === "") continue;
          expect(tokens(text), key).toEqual(tokens(source[key] ?? ""));
        }
      });
    }
  }
});
