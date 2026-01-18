#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";

// =============================================================================
// Types
// =============================================================================

type TranslationObject = Record<string, unknown>;

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

interface FlattenedTranslation {
  key: string;
  value: string;
}

// =============================================================================
// Constants
// =============================================================================

const LOCALES_DIR = join(process.cwd(), "apps/desktop/src/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");
const LANGUAGES_JSON = join(process.cwd(), "languages.json");
const I18N_FILE = join(process.cwd(), "apps/desktop/src/lib/i18n.ts");
const LANGUAGE_SETTINGS_FILE = join(
  process.cwd(),
  "apps/desktop/src/components/settings/language-settings.tsx",
);

const ISO_CODES_URL = "https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes";

// =============================================================================
// Utility Functions
// =============================================================================

function isObject(value: unknown): value is TranslationObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenObject(
  obj: TranslationObject,
  prefix: string = "",
): FlattenedTranslation[] {
  const result: FlattenedTranslation[] = [];

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isObject(value)) {
      result.push(...flattenObject(value, fullKey));
    } else if (typeof value === "string") {
      result.push({ key: fullKey, value });
    }
  }

  return result;
}

function unflattenObject(items: FlattenedTranslation[]): TranslationObject {
  const result: TranslationObject = {};

  for (const { key, value } of items) {
    const parts = key.split(".");
    let current = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as TranslationObject;
    }

    current[parts[parts.length - 1]] = value;
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

function codeToVariableName(code: string): string {
  return code.replace(/-([a-zA-Z])/g, (_, letter) => letter.toUpperCase());
}

function getExistingLanguages(): Language[] {
  const data: LanguagesData = JSON.parse(readFileSync(LANGUAGES_JSON, "utf-8"));
  return data.languages;
}

function getExistingLocaleCodes(): string[] {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "template")
    .map((d) => d.name);
}

// =============================================================================
// Readline Helper
// =============================================================================

class ConsoleHelper {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async selectOption(prompt: string, options: string[]): Promise<number> {
    console.log(`\n${prompt}`);
    for (let i = 0; i < options.length; i++) {
      console.log(`  [${i + 1}] ${options[i]}`);
    }

    while (true) {
      const answer = await this.question("\nEnter your choice: ");
      const num = Number.parseInt(answer, 10);

      if (num >= 1 && num <= options.length) {
        return num - 1;
      }

      console.log(`Please enter a number between 1 and ${options.length}`);
    }
  }

  async confirm(prompt: string): Promise<boolean> {
    const answer = await this.question(`${prompt} (y/n): `);
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  }

  close(): void {
    this.rl.close();
  }

  print(message: string): void {
    console.log(message);
  }

  printDivider(): void {
    console.log(`\n${"=".repeat(80)}\n`);
  }
}

// =============================================================================
// New Translation Flow
// =============================================================================

async function createNewTranslation(cli: ConsoleHelper): Promise<void> {
  cli.printDivider();
  cli.print("CREATE NEW TRANSLATION");
  cli.printDivider();

  cli.print(
    "Language codes follow ISO 639-1 standard (or BCP 47 for regional variants).",
  );
  cli.print(`Reference: ${ISO_CODES_URL}`);
  cli.print("\nExisting languages in this project:");

  const existingCodes = getExistingLocaleCodes();
  cli.print(`  ${existingCodes.join(", ")}`);

  cli.printDivider();

  // Collect language metadata
  const code = await cli.question(
    "Enter language code (e.g., ko, vi, nl, pt-BR): ",
  );

  if (!code) {
    cli.print("Language code is required. Aborting.");
    return;
  }

  if (existingCodes.includes(code)) {
    cli.print(
      `Language '${code}' already exists. Use 'Update existing translation' instead.`,
    );
    return;
  }

  const name = await cli.question(
    "Enter language name in English (e.g., Korean, Vietnamese): ",
  );
  if (!name) {
    cli.print("Language name is required. Aborting.");
    return;
  }

  const nativeName = await cli.question(
    "Enter native name (e.g., 한국어, Tiếng Việt): ",
  );
  if (!nativeName) {
    cli.print("Native name is required. Aborting.");
    return;
  }

  const flag = await cli.question("Enter flag emoji (e.g., 🇰🇷, 🇻🇳): ");
  if (!flag) {
    cli.print("Flag emoji is required. Aborting.");
    return;
  }

  cli.printDivider();
  cli.print("CONTRIBUTOR INFORMATION");
  cli.print("Your name and link will be added to the README credits.\n");

  const contributorName = await cli.question("Enter your name/username: ");
  if (!contributorName) {
    cli.print("Contributor name is required. Aborting.");
    return;
  }

  const linkTypeIndex = await cli.selectOption("Select link type:", [
    "Discord username",
    "GitHub username",
    "Email address",
  ]);

  const linkTypes = ["discord", "github", "email"] as const;
  const linkType = linkTypes[linkTypeIndex];

  const linkPrompts: Record<string, string> = {
    discord: "Enter Discord username (without @): ",
    github: "Enter GitHub username: ",
    email: "Enter email address: ",
  };

  const linkValue = await cli.question(linkPrompts[linkType]);
  if (!linkValue) {
    cli.print("Link value is required. Aborting.");
    return;
  }

  const contributor: Contributor = { name: contributorName };
  contributor[linkType] = linkValue;

  cli.printDivider();
  cli.print("TRANSLATION PHASE");
  cli.print("You will now translate each string from English.");
  cli.print("Press Enter without typing to keep the English value.");
  cli.print("Type 'quit' to abort (progress will NOT be saved).");
  cli.print("Type 'pause' to save progress and continue later.\n");

  const englishData: TranslationObject = JSON.parse(
    readFileSync(ENGLISH_FILE, "utf-8"),
  );
  const flattenedEnglish = flattenObject(englishData);
  const translatedItems: FlattenedTranslation[] = [];

  const totalKeys = flattenedEnglish.length;
  let currentIndex = 0;
  let isPaused = false;

  for (const { key, value } of flattenedEnglish) {
    currentIndex++;
    const progress = `[${currentIndex}/${totalKeys}]`;

    cli.print(`\n${progress} ${key}`);
    cli.print(`  English: ${value}`);

    const translation = await cli.question("  Translation: ");

    if (translation.toLowerCase() === "quit") {
      cli.print("\nTranslation aborted. No files were saved.");
      return;
    }

    if (translation.toLowerCase() === "pause") {
      cli.print("\nPausing translation. Saving progress...");
      isPaused = true;
      break;
    }

    if (translation === "") {
      const keepEnglish = await cli.confirm("  Keep English value?");
      translatedItems.push({ key, value: keepEnglish ? value : "" });
    } else {
      translatedItems.push({ key, value: translation });
    }
  }

  if (translatedItems.length === 0) {
    cli.print("No translations were entered. Nothing to save.");
    return;
  }

  cli.printDivider();
  cli.print("SAVING FILES...\n");

  // Create translation file
  const localeDir = join(LOCALES_DIR, code);
  if (!existsSync(localeDir)) {
    mkdirSync(localeDir, { recursive: true });
  }

  const translationObject = unflattenObject(translatedItems);
  const sortedTranslation = sortKeys(translationObject);
  const translationFile = join(localeDir, "translation.json");
  writeFileSync(
    translationFile,
    `${JSON.stringify(sortedTranslation, null, 2)}\n`,
    "utf-8",
  );
  cli.print(`Created: ${translationFile}`);

  // Update languages.json
  const languagesData: LanguagesData = JSON.parse(
    readFileSync(LANGUAGES_JSON, "utf-8"),
  );
  const translationStatus = isPaused ? "in-progress" : "complete";
  const newLanguage: Language = {
    code,
    name,
    nativeName,
    flag,
    status: translationStatus,
    isDefault: false,
    contributors: [contributor],
  };
  languagesData.languages.push(newLanguage);
  writeFileSync(
    LANGUAGES_JSON,
    `${JSON.stringify(languagesData, null, 2)}\n`,
    "utf-8",
  );
  cli.print(`Updated: ${LANGUAGES_JSON}`);

  // Update i18n.ts
  updateI18nFile(code, cli);

  // Update language-settings.tsx
  updateLanguageSettingsFile(code, name, nativeName, flag, cli);

  cli.printDivider();

  if (isPaused) {
    const remaining = totalKeys - translatedItems.length;
    cli.print(
      `Translation paused! ${translatedItems.length}/${totalKeys} strings translated.`,
    );
    cli.print(`${remaining} strings remaining.`);
    cli.print("\nTo continue later:");
    cli.print("1. Run 'pnpm translate'");
    cli.print("2. Select 'Update an existing translation'");
    cli.print(`3. Choose '${code} - ${name} (${nativeName})'`);
  } else {
    cli.print("Translation complete!");
  }

  cli.print("\nNext steps:");
  cli.print("1. Run 'pnpm lint:fix' to format the files");
  cli.print(
    "2. Run 'pnpm generate-lang-table' to update README language table",
  );
  cli.print("3. Test the translation in the desktop app");
}

function updateI18nFile(code: string, cli: ConsoleHelper): void {
  let content = readFileSync(I18N_FILE, "utf-8");

  const varName = `${codeToVariableName(code)}Translation`;
  const needsMultiline = code.includes("-");

  // Add import statement after the last import
  const importRegex =
    /^import .+Translation from "@\/locales\/.+\/translation\.json".+$/gm;
  const matches = [...content.matchAll(importRegex)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const insertPosition = lastMatch.index! + lastMatch[0].length;

    let newImport: string;
    if (needsMultiline) {
      newImport = `\nimport ${varName} from "@/locales/${code}/translation.json" with {\n  type: "json",\n};`;
    } else {
      newImport = `\nimport ${varName} from "@/locales/${code}/translation.json" with { type: "json" };`;
    }

    content =
      content.slice(0, insertPosition) +
      newImport +
      content.slice(insertPosition);
  }

  // Add to resources object
  const resourcesEndRegex =
    /(\s*)(ja:\s*{\s*translation:\s*jaTranslation,?\s*},?)\s*\n(\s*};)/;
  const resourceMatch = content.match(resourcesEndRegex);

  if (resourceMatch) {
    const resourceKey = code.includes("-") ? `"${code}"` : code;
    const newResource = `${resourceMatch[1]}${resourceMatch[2]}\n${resourceMatch[1]}${resourceKey}: {\n${resourceMatch[1]}  translation: ${varName},\n${resourceMatch[1]}},\n${resourceMatch[3]}`;
    content = content.replace(resourcesEndRegex, newResource);
  }

  // Add to supportedLngs array
  const supportedLngsRegex = /(\s*)"ja",?\s*\n(\s*\],)/;
  const supportedMatch = content.match(supportedLngsRegex);

  if (supportedMatch) {
    const langCode = code.includes("-") ? `"${code}"` : `"${code}"`;
    content = content.replace(
      supportedLngsRegex,
      `${supportedMatch[1]}"ja",\n${supportedMatch[1]}${langCode},\n${supportedMatch[2]}`,
    );
  }

  writeFileSync(I18N_FILE, content, "utf-8");
  cli.print(`Updated: ${I18N_FILE}`);
}

function updateLanguageSettingsFile(
  code: string,
  _name: string,
  nativeName: string,
  flag: string,
  cli: ConsoleHelper,
): void {
  let content = readFileSync(LANGUAGE_SETTINGS_FILE, "utf-8");

  // Find the languages array and add the new language
  const lastLanguageRegex =
    /(\s*\{\s*code:\s*"ja",\s*name:\s*"日本語",\s*flag:\s*"🇯🇵"\s*\},?)\s*\n(\s*\];)/;
  const match = content.match(lastLanguageRegex);

  if (match) {
    const newEntry = `${match[1]}\n  { code: "${code}", name: "${nativeName}", flag: "${flag}" },\n${match[2]}`;
    content = content.replace(lastLanguageRegex, newEntry);
  }

  writeFileSync(LANGUAGE_SETTINGS_FILE, content, "utf-8");
  cli.print(`Updated: ${LANGUAGE_SETTINGS_FILE}`);
}

// =============================================================================
// Update Existing Translation Flow
// =============================================================================

async function updateExistingTranslation(cli: ConsoleHelper): Promise<void> {
  cli.printDivider();
  cli.print("UPDATE EXISTING TRANSLATION");
  cli.printDivider();

  const languages = getExistingLanguages().filter((lang) => !lang.isDefault);

  if (languages.length === 0) {
    cli.print("No translations available to update.");
    return;
  }

  const options = languages.map(
    (lang) => `${lang.code} - ${lang.name} (${lang.nativeName})`,
  );
  const selectedIndex = await cli.selectOption(
    "Select translation to update:",
    options,
  );
  const selectedLanguage = languages[selectedIndex];

  cli.print(`\nSelected: ${selectedLanguage.name} (${selectedLanguage.code})`);

  // Load English master and target translation
  const englishData: TranslationObject = JSON.parse(
    readFileSync(ENGLISH_FILE, "utf-8"),
  );
  const targetFile = join(
    LOCALES_DIR,
    selectedLanguage.code,
    "translation.json",
  );

  if (!existsSync(targetFile)) {
    cli.print(`Translation file not found: ${targetFile}`);
    return;
  }

  const targetData: TranslationObject = JSON.parse(
    readFileSync(targetFile, "utf-8"),
  );

  // Find missing keys
  const flattenedEnglish = flattenObject(englishData);
  const flattenedTarget = flattenObject(targetData);
  const existingKeys = new Set(flattenedTarget.map((item) => item.key));

  const missingItems = flattenedEnglish.filter(
    (item) => !existingKeys.has(item.key),
  );

  if (missingItems.length === 0) {
    cli.print("\nNo missing translations found. The translation is complete!");
    return;
  }

  cli.printDivider();
  cli.print(`Found ${missingItems.length} missing translation(s).\n`);
  cli.print("You will now translate each missing string from English.");
  cli.print("Press Enter without typing to keep the English value.");
  cli.print("Type 'quit' to abort (progress will NOT be saved).");
  cli.print("Type 'pause' to save progress and continue later.\n");

  const newTranslations: FlattenedTranslation[] = [];
  const totalMissing = missingItems.length;
  let currentIndex = 0;
  let isPaused = false;

  for (const { key, value } of missingItems) {
    currentIndex++;
    const progress = `[${currentIndex}/${totalMissing}]`;

    cli.print(`\n${progress} ${key}`);
    cli.print(`  English: ${value}`);

    const translation = await cli.question("  Translation: ");

    if (translation.toLowerCase() === "quit") {
      cli.print("\nUpdate aborted. No files were saved.");
      return;
    }

    if (translation.toLowerCase() === "pause") {
      cli.print("\nPausing translation. Saving progress...");
      isPaused = true;
      break;
    }

    if (translation === "") {
      const keepEnglish = await cli.confirm("  Keep English value?");
      newTranslations.push({ key, value: keepEnglish ? value : "" });
    } else {
      newTranslations.push({ key, value: translation });
    }
  }

  if (newTranslations.length === 0) {
    cli.print("No translations were entered. Nothing to save.");
    return;
  }

  cli.printDivider();
  cli.print("SAVING FILES...\n");

  // Merge translations
  const allTranslations = [...flattenedTarget, ...newTranslations];
  const mergedObject = unflattenObject(allTranslations);
  const sortedMerged = sortKeys(mergedObject);

  writeFileSync(
    targetFile,
    `${JSON.stringify(sortedMerged, null, 2)}\n`,
    "utf-8",
  );
  cli.print(`Updated: ${targetFile}`);

  // Update status in languages.json if completed
  if (!isPaused) {
    const languagesData: LanguagesData = JSON.parse(
      readFileSync(LANGUAGES_JSON, "utf-8"),
    );
    const langEntry = languagesData.languages.find(
      (l) => l.code === selectedLanguage.code,
    );
    if (langEntry && langEntry.status === "in-progress") {
      langEntry.status = "complete";
      writeFileSync(
        LANGUAGES_JSON,
        `${JSON.stringify(languagesData, null, 2)}\n`,
        "utf-8",
      );
      cli.print(`Updated: ${LANGUAGES_JSON} (status: complete)`);
    }
  }

  cli.printDivider();

  if (isPaused) {
    const remaining = totalMissing - newTranslations.length;
    cli.print(
      `Translation paused! ${newTranslations.length}/${totalMissing} missing strings translated.`,
    );
    cli.print(`${remaining} strings still missing.`);
    cli.print(
      "\nTo continue later, run 'pnpm translate' and select this language again.",
    );
  } else {
    cli.print("Translation update complete!");
  }

  cli.print("\nNext steps:");
  cli.print("1. Run 'pnpm lint:fix' to format the files");
  cli.print("2. Test the translation in the desktop app");
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const cli = new ConsoleHelper();

  try {
    cli.print("\n");
    cli.print(
      "================================================================================",
    );
    cli.print(
      "                    DEADLOCK MOD MANAGER - TRANSLATION HELPER                  ",
    );
    cli.print(
      "================================================================================",
    );
    cli.print(
      "\nThis tool helps you create or update translations for the desktop app.\n",
    );

    const modeIndex = await cli.selectOption("What would you like to do?", [
      "Create a new translation",
      "Update an existing translation",
    ]);

    if (modeIndex === 0) {
      await createNewTranslation(cli);
    } else {
      await updateExistingTranslation(cli);
    }
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  } finally {
    cli.close();
  }
}

if (import.meta.main) {
  main();
}
