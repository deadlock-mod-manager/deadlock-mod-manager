import { Glob } from "bun";
import { describe, expect, it } from "bun:test";
import { basename, join } from "node:path";
import { createInstance } from "i18next";
import en from "../locales/en.json";
import {
  SETTINGS_SEARCH_INDEX,
  SETTINGS_TAB_LABEL_KEYS,
  type SettingsSearchSection,
  searchSettings,
} from "./settings-search";

const i18n = createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: en } },
  showSupportNotice: false,
});
const translate = (key: string) => i18n.t(key);

const SECTIONS: SettingsSearchSection[] = [
  {
    id: "system",
    tab: "application",
    titleKey: "System settings",
    settings: [
      { titleKey: "Auto update", descriptionKey: "Install updates on launch" },
      { titleKey: "Developer mode" },
    ],
  },
  {
    tab: "network",
    titleKey: "Proxy",
    descriptionKey: "Route traffic through a proxy server",
  },
];

const stripSettingsPrefix = (key: string) => key.replace("settings.", "");

describe("searchSettings", () => {
  it("returns nothing for a blank query", () => {
    expect(searchSettings("   ", stripSettingsPrefix, SECTIONS)).toEqual([]);
  });

  it("finds an individual setting and points at its section", () => {
    const [result] = searchSettings("developer", stripSettingsPrefix, SECTIONS);
    expect(result).toEqual({
      tab: "application",
      sectionId: "system",
      titleKey: "Developer mode",
      title: "Developer mode",
      breadcrumb: "application › System settings",
    });
  });

  it("requires every word to match, in any order", () => {
    expect(
      searchSettings("launch updates", stripSettingsPrefix, SECTIONS).map(
        (r) => r.title,
      ),
    ).toEqual(["Auto update"]);
    expect(
      searchSettings("launch proxy", stripSettingsPrefix, SECTIONS),
    ).toEqual([]);
  });

  it("ranks title matches above description matches", () => {
    expect(
      searchSettings("proxy", stripSettingsPrefix, SECTIONS).map(
        (r) => r.title,
      ),
    ).toEqual(["Proxy"]);
    expect(
      searchSettings("update", stripSettingsPrefix, SECTIONS).map(
        (r) => r.title,
      )[0],
    ).toBe("Auto update");
  });

  it("ignores case and diacritics", () => {
    const sections: SettingsSearchSection[] = [
      { tab: "game", titleKey: "Paramètres du jeu" },
    ];
    expect(
      searchSettings("PARAMETRES", stripSettingsPrefix, sections),
    ).toHaveLength(1);
  });

  it("finds real settings by their English labels", () => {
    expect(
      searchSettings("proxy", translate).some((r) => r.tab === "network"),
    ).toBe(true);
    expect(searchSettings("nsfw", translate)[0]?.tab).toBe("privacy");
  });
});

const SETTINGS_SOURCES = [
  ...new Glob("../components/settings/**/*.tsx").scanSync(import.meta.dir),
  "../pages/settings.tsx",
];

// Files under components/settings that are not part of the settings page.
const IGNORED_FILES = new Set([
  "add-setting.tsx", // create-launch-option dialog fields
  "restore-backup-dialog.tsx", // restore strategy choices inside a dialog
  "crosshairs-toggle.tsx", // rendered on the crosshairs page
]);

// Label/description pairs that are not standalone settings.
const IGNORED_LABELS = new Set([
  "settings.backupWillRemoveOldest", // warning shown next to the backup count
]);

const TRANSLATION_CALL_REGEX = /\bt\(\s*"([\w.]+)"/g;
const SEARCH_ID_PROP_REGEX = /\bsearchId='([\w-]+)'/g;

/**
 * A key is treated as a setting label when the same file also renders its
 * description: `foo` + `fooDescription`, or `x.title` + `x.description`.
 */
const findSettingLabels = (source: string) => {
  const keys = new Set(
    Array.from(source.matchAll(TRANSLATION_CALL_REGEX), ([, key]) => key),
  );
  return [...keys].filter(
    (key) =>
      keys.has(`${key}Description`) ||
      (key.endsWith(".title") &&
        keys.has(key.replace(/\.title$/, ".description"))),
  );
};

describe("SETTINGS_SEARCH_INDEX", () => {
  const entries = SETTINGS_SEARCH_INDEX.flatMap((section) =>
    (section.settings ?? []).concat(section),
  );

  it("only references translation keys that exist", () => {
    const keys = entries
      .flatMap(({ titleKey, descriptionKey }) =>
        descriptionKey ? [titleKey, descriptionKey] : [titleKey],
      )
      .concat(Object.values(SETTINGS_TAB_LABEL_KEYS));

    expect(keys.filter((key) => !i18n.exists(key))).toEqual([]);
  });

  it("covers every setting rendered on the settings page", async () => {
    const indexed = new Set<string>(
      entries
        .map(({ titleKey }) => titleKey)
        .concat(Object.values(SETTINGS_TAB_LABEL_KEYS)),
    );
    const sources = SETTINGS_SOURCES.filter(
      (path) => !IGNORED_FILES.has(basename(path)),
    );

    const missing: string[] = [];
    for (const path of sources) {
      const source = await Bun.file(join(import.meta.dir, path)).text();
      for (const label of findSettingLabels(source)) {
        if (!indexed.has(label) && !IGNORED_LABELS.has(label)) {
          missing.push(`${basename(path)}: ${label}`);
        }
      }
    }

    // Add these to SETTINGS_SEARCH_INDEX, or to an ignore list above if they
    // are not user-facing settings.
    expect(missing).toEqual([]);
  });

  it("points at section anchors that exist on the settings page", async () => {
    const page = await Bun.file(
      join(import.meta.dir, "../pages/settings.tsx"),
    ).text();
    const anchors = Array.from(
      page.matchAll(SEARCH_ID_PROP_REGEX),
      ([, id]) => id,
    ).sort();
    const indexIds = SETTINGS_SEARCH_INDEX.flatMap(({ id }) =>
      id ? [id] : [],
    ).sort();

    expect(indexIds).toEqual(anchors);
  });
});
