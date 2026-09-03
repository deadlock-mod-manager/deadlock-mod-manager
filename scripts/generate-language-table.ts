#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Contributor {
  name: string;
  github?: string;
  discord?: string;
  email?: string;
}

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  status: "complete" | "in-progress";
  isDefault: boolean;
  contributors: Contributor[];
}

interface LanguagesData {
  languages: Language[];
}

interface CrowdinProgressItem {
  data: {
    languageId: string;
    translationProgress: number;
    approvalProgress: number;
  };
}

interface CrowdinProgressResponse {
  data: CrowdinProgressItem[];
}

interface TableLocale {
  languageColumn: string;
  nativeNameColumn: string;
  statusColumn: string;
  contributorsColumn: string;
  defaultSuffix: string;
  complete: string;
  inProgress: string;
  helpWanted: string;
  languageNames: Record<string, string>;
}

interface ReadmeTarget {
  path: string;
  locale: string;
}

const CROWDIN_API_BASE = "https://api.crowdin.com/api/v2";

// Crowdin uses its own language identifiers that mostly match BCP-47 but drop
// the region for languages where only one variant exists. Map our languages.json
// codes to what Crowdin reports in its /languages/progress response.
const CROWDIN_LANGUAGE_ID_OVERRIDES: Record<string, string> = {
  "fr-FR": "fr",
  "de-DE": "de",
  "ru-RU": "ru",
  "ar-SA": "ar",
  "pl-PL": "pl",
  "th-TH": "th",
  "tr-TR": "tr",
  "es-ES": "es",
  "it-IT": "it",
  "ja-JP": "ja",
  "ko-KR": "ko",
  "bg-BG": "bg",
};

// Resolve the repository root from the script location when running under
// Bun; fall back to the working directory (package.json script and the
// update-language-table workflow run from the repository root).
const REPO_ROOT = import.meta.dir ? join(import.meta.dir, "..") : process.cwd();
const TRANSLATIONS_DIR = join(REPO_ROOT, "docs", "translations");

const TABLE_LOCALES: Record<string, TableLocale> = {
  en: {
    languageColumn: "Language",
    nativeNameColumn: "Native Name",
    statusColumn: "Status",
    contributorsColumn: "Contributors",
    defaultSuffix: " (Default)",
    complete: "Complete",
    inProgress: "In Progress",
    helpWanted: "Help Wanted!",
    languageNames: {},
  },
  "zh-CN": {
    languageColumn: "语言",
    nativeNameColumn: "母语名称",
    statusColumn: "状态",
    contributorsColumn: "贡献者",
    defaultSuffix: "（默认）",
    complete: "已完成",
    inProgress: "进行中",
    helpWanted: "期待贡献",
    languageNames: {
      English: "英语",
      Bulgarian: "保加利亚语",
      Belarusian: "白俄罗斯语",
      German: "德语",
      French: "法语",
      Russian: "俄语",
      Arabic: "阿拉伯语",
      Polish: "波兰语",
      "Swiss German": "瑞士德语",
      Thai: "泰语",
      Turkish: "土耳其语",
      "Chinese (Simplified)": "简体中文",
      "Chinese (Traditional)": "繁体中文",
      Spanish: "西班牙语",
      "Portuguese (Brazil)": "葡萄牙语（巴西）",
      Italian: "意大利语",
      Japanese: "日语",
      Korean: "韩语",
    },
  },
};

function toCrowdinLanguageId(code: string): string {
  return CROWDIN_LANGUAGE_ID_OVERRIDES[code] ?? code;
}

function getTableLocale(locale: string): TableLocale {
  return TABLE_LOCALES[locale] ?? TABLE_LOCALES.en;
}

async function fetchCrowdinProgress(): Promise<Map<string, number> | null> {
  const projectId = process.env.CROWDIN_PROJECT_ID;
  const token = process.env.CROWDIN_PERSONAL_TOKEN;

  if (!projectId || !token) {
    console.warn(
      "⚠️  CROWDIN_PROJECT_ID or CROWDIN_PERSONAL_TOKEN not set; falling back to languages.json status.",
    );
    return null;
  }

  try {
    const url = `${CROWDIN_API_BASE}/projects/${projectId}/languages/progress?limit=500`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(
        `⚠️  Crowdin API returned ${res.status} ${res.statusText}; falling back to languages.json status.`,
      );
      return null;
    }

    const json = (await res.json()) as CrowdinProgressResponse;
    const map = new Map<string, number>();
    for (const item of json.data) {
      map.set(item.data.languageId, item.data.translationProgress);
    }
    return map;
  } catch (error) {
    console.warn(
      "⚠️  Failed to fetch Crowdin progress; falling back to languages.json status.",
      error,
    );
    return null;
  }
}

function loadLanguages(): Language[] {
  const languagesPath = join(REPO_ROOT, "languages.json");
  const languagesData: LanguagesData = JSON.parse(
    readFileSync(languagesPath, "utf8"),
  );
  return languagesData.languages;
}

function formatStatus(
  lang: Language,
  progress: Map<string, number> | null,
  locale: TableLocale,
): string {
  if (lang.isDefault) {
    return `✅ ${locale.complete}`;
  }

  const pct = progress?.get(toCrowdinLanguageId(lang.code));

  if (pct === undefined) {
    return lang.status === "complete"
      ? `✅ ${locale.complete}`
      : `🚧 ${locale.inProgress}`;
  }

  if (pct >= 100) return "✅ 100%";
  if (pct > 0) return `🚧 ${pct}%`;
  return "🔴 0%";
}

function buildLanguageTable(
  languages: Language[],
  progress: Map<string, number> | null,
  locale: string,
): string {
  const l = getTableLocale(locale);

  let table = `| ${l.languageColumn} | ${l.nativeNameColumn} | ${l.statusColumn} | ${l.contributorsColumn} |\n`;
  table += "|----------|-------------|--------|-------------|\n";

  languages.forEach((lang) => {
    const languageName = l.languageNames[lang.name] ?? lang.name;
    const name = lang.isDefault
      ? `${lang.flag} **${languageName}**${l.defaultSuffix}`
      : `${lang.flag} **${languageName}**`;
    const nativeName = lang.nativeName;
    const status = formatStatus(lang, progress, l);

    let contributors = "";
    if (lang.contributors && lang.contributors.length > 0) {
      contributors = lang.contributors
        .map((contributor) => {
          if (contributor.github) {
            return `[${contributor.name}](https://github.com/${contributor.github})`;
          }
          if (contributor.discord) {
            return `[${contributor.name}](https://discordapp.com/users/${contributor.discord}/)`;
          }
          if (contributor.email) {
            return `[${contributor.name}](mailto:${contributor.email})`;
          }
          return contributor.name;
        })
        .join(", ");
    } else if (lang.isDefault) {
      contributors = "-";
    } else {
      contributors = l.helpWanted;
    }

    table += `| ${name} | ${nativeName} | ${status} | ${contributors} |\n`;
  });

  return table;
}

async function generateLanguageTable(locale = "en"): Promise<string> {
  const languages = loadLanguages();
  const progress = await fetchCrowdinProgress();
  return buildLanguageTable(languages, progress, locale);
}

function isReadmeFile(file: string): boolean {
  return file.startsWith("README") && file.endsWith(".md");
}

function localeFromRootReadme(file: string): string {
  const match = /^README\.(.+)\.md$/.exec(file);
  return match?.[1] ?? "en";
}

function discoverReadmeTargets(): ReadmeTarget[] {
  const targets: ReadmeTarget[] = [];

  for (const file of readdirSync(REPO_ROOT).filter(isReadmeFile).sort()) {
    targets.push({ path: file, locale: localeFromRootReadme(file) });
  }

  if (!existsSync(TRANSLATIONS_DIR)) {
    return targets;
  }

  const locales = readdirSync(TRANSLATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const locale of locales) {
    const localeDir = join(TRANSLATIONS_DIR, locale);
    for (const file of readdirSync(localeDir).filter(isReadmeFile).sort()) {
      targets.push({ path: join(localeDir, file), locale });
    }
  }

  return targets;
}

function replaceLanguageTable(filePath: string, table: string): void {
  const content = readFileSync(filePath, "utf8");

  const startMarker = "<!-- LANGUAGE_TABLE_START -->";
  const endMarker = "<!-- LANGUAGE_TABLE_END -->";

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1) {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const beforeTable = content.substring(0, startIndex + startMarker.length);
    const afterTable = content.substring(endIndex);
    const tableWithEol = table.split("\n").join(eol);

    const newContent = `${beforeTable}${eol}${eol}${tableWithEol}${eol}${afterTable}`;
    writeFileSync(filePath, newContent);
    console.log(`✅ Updated ${filePath}`);
  } else {
    console.warn(`⚠️  Could not find language table markers in ${filePath}`);
    console.warn(`   Looking for: ${startMarker} ... ${endMarker}`);
  }
}

function updateReadmeFiles(progress: Map<string, number> | null): void {
  const languages = loadLanguages();

  for (const target of discoverReadmeTargets()) {
    if (!(target.locale in TABLE_LOCALES)) {
      console.warn(
        `⚠️  No language-table localization for "${target.locale}"; skipping ${target.path}`,
      );
      continue;
    }

    const table = buildLanguageTable(languages, progress, target.locale);
    replaceLanguageTable(target.path, table);
  }
}

if (import.meta.main) {
  console.log("🌍 Generating language table...\n");

  const languages = loadLanguages();
  const progress = await fetchCrowdinProgress();

  const table = buildLanguageTable(languages, progress, "en");
  console.log("Generated language table:");
  console.log("─".repeat(80));
  console.log(table);
  console.log("─".repeat(80));

  if (process.argv.includes("--update-readme")) {
    console.log("\n📝 Updating README files...\n");
    updateReadmeFiles(progress);
    console.log("\n✨ Done!");
  } else {
    console.log("\n💡 Run with --update-readme to update README files");
  }
}

export {
  buildLanguageTable,
  discoverReadmeTargets,
  generateLanguageTable,
  getTableLocale,
  replaceLanguageTable,
  updateReadmeFiles,
};
