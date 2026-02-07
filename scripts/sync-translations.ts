import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type TranslationObject = Record<string, unknown>;

const LOCALES_DIR = join(process.cwd(), "apps/desktop/src/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");

const LANGUAGE_CODES = [
  "ar",
  "bg",
  "de",
  "es",
  "fr",
  "gsw",
  "it",
  "ja",
  "pl",
  "pt-BR",
  "ru",
  "th",
  "tr",
  "zh-CN",
  "zh-TW",
];

function isObject(value: unknown): value is TranslationObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function syncKeys(
  source: TranslationObject,
  target: TranslationObject,
): TranslationObject {
  const result: TranslationObject = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (!(key in target)) {
      result[key] = sourceValue;
    } else if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = syncKeys(sourceValue, targetValue);
    }
  }

  return result;
}

function sortKeys(obj: TranslationObject): TranslationObject {
  const sorted: TranslationObject = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];
    if (isObject(value)) {
      sorted[key] = sortKeys(value);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

async function syncTranslationFile(languageCode: string): Promise<void> {
  const filePath = join(LOCALES_DIR, languageCode, "translation.json");

  try {
    const targetContent = await readFile(filePath, "utf-8");
    const target = JSON.parse(targetContent) as TranslationObject;

    const sourceContent = await readFile(ENGLISH_FILE, "utf-8");
    const source = JSON.parse(sourceContent) as TranslationObject;

    const synced = syncKeys(source, target);
    const sorted = sortKeys(synced);

    const formatted = JSON.stringify(sorted, null, 2);
    await writeFile(filePath, `${formatted}\n`, "utf-8");

    console.log(`✅ Synced ${languageCode}`);
  } catch (error) {
    console.error(`❌ Failed to sync ${languageCode}:`, error);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log("Starting translation sync...\n");

  for (const languageCode of LANGUAGE_CODES) {
    await syncTranslationFile(languageCode);
  }

  console.log("\n✨ Translation sync completed!");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
