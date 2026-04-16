#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function toCrowdinLanguageId(code: string): string {
  return CROWDIN_LANGUAGE_ID_OVERRIDES[code] ?? code;
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

function formatStatus(
  lang: Language,
  progress: Map<string, number> | null,
): string {
  if (lang.isDefault) {
    return "✅ Complete";
  }

  const pct = progress?.get(toCrowdinLanguageId(lang.code));

  if (pct === undefined) {
    return lang.status === "complete" ? "✅ Complete" : "🚧 In Progress";
  }

  if (pct >= 100) return "✅ 100%";
  if (pct > 0) return `🚧 ${pct}%`;
  return "🔴 0%";
}

async function generateLanguageTable(): Promise<string> {
  const languagesPath = join(import.meta.dir, "..", "languages.json");
  const languagesData: LanguagesData = JSON.parse(
    readFileSync(languagesPath, "utf8"),
  );

  const progress = await fetchCrowdinProgress();

  let table = "| Language | Native Name | Status | Contributors |\n";
  table += "|----------|-------------|--------|-------------|\n";

  languagesData.languages.forEach((lang) => {
    const name = lang.isDefault
      ? `${lang.flag} **${lang.name}** (Default)`
      : `${lang.flag} **${lang.name}**`;
    const nativeName = lang.nativeName;
    const status = formatStatus(lang, progress);

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
      contributors = "Help Wanted!";
    }

    table += `| ${name} | ${nativeName} | ${status} | ${contributors} |\n`;
  });

  return table;
}

function updateReadmeFiles(table: string): void {
  const readmeFiles = readdirSync(".")
    .filter((file) => file.startsWith("README") && file.endsWith(".md"))
    .sort();

  readmeFiles.forEach((file) => {
    try {
      const content = readFileSync(file, "utf8");

      const startMarker = "<!-- LANGUAGE_TABLE_START -->";
      const endMarker = "<!-- LANGUAGE_TABLE_END -->";

      const startIndex = content.indexOf(startMarker);
      const endIndex = content.indexOf(endMarker);

      if (startIndex !== -1 && endIndex !== -1) {
        const beforeTable = content.substring(
          0,
          startIndex + startMarker.length,
        );
        const afterTable = content.substring(endIndex);

        const newContent = `${beforeTable}\n\n${table}\n${afterTable}`;
        writeFileSync(file, newContent);
        console.log(`✅ Updated ${file}`);
      } else {
        console.warn(`⚠️  Could not find language table markers in ${file}`);
        console.warn(`   Looking for: ${startMarker} ... ${endMarker}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${file}:`, error);
    }
  });
}

if (import.meta.main) {
  console.log("🌍 Generating language table...\n");

  const table = await generateLanguageTable();
  console.log("Generated language table:");
  console.log("─".repeat(80));
  console.log(table);
  console.log("─".repeat(80));

  if (process.argv.includes("--update-readme")) {
    console.log("\n📝 Updating README files...\n");
    updateReadmeFiles(table);
    console.log("\n✨ Done!");
  } else {
    console.log("\n💡 Run with --update-readme to update README files");
  }
}

export { generateLanguageTable, updateReadmeFiles };
