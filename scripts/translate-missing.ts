#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type TranslationObject = Record<string, unknown>;

const DESKTOP_SRC = join(process.cwd(), "apps/desktop/src");
const LOCALES_DIR = join(process.cwd(), "apps/desktop/src/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");

const MIN_STRING_LENGTH = 2;
const MAX_STRING_LENGTH = 300;

const SKIP_PATTERNS = [
  /^\s*$/,
  /^[\d\s.,%:]+$/,
  /^[{}[\](),;]+$/,
  /^[a-z]+-[a-z-]+$/,
  /^[\w-]+\.(tsx?|json|css|svg)$/i,
  /^\/[/\w.-]+$/,
  /^\.\/[\w/.-]+$/,
  /^@\/[\w/.-]+$/,
  /^https?:\/\//i,
  /^["'].*["']$/,
  /^`.*`$/,
];

const CODE_LIKE_PATTERNS = [
  /\.(test|length|name|value|id)\(/,
  /\)\s*[;,]/,
  /=>\s*[{(]/,
  /if\s*\(|return\s+/,
  /^\s*[;{}[\](),]\s*$/,
  /\[[\w.]+\]/,
  /&&\s*\w+|^\s*\|\|/,
  /validFiles|archiveFile|\.map\(|\.filter\(/,
  /["']\s*$/,
  /^\s*\\\s*["']/,
];

function isObject(value: unknown): value is TranslationObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenValues(
  obj: TranslationObject,
  prefix: string,
  out: Set<string>,
): void {
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (isObject(value)) {
      flattenValues(value, fullKey, out);
    } else if (typeof value === "string") {
      out.add(value.trim());
    }
  }
}

function getAllEnglishValues(en: TranslationObject): Set<string> {
  const values = new Set<string>();
  flattenValues(en, "", values);
  return values;
}

function stringToKey(s: string): string {
  const trimmed = s.trim();
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!normalized) return "unknown";
  return normalized.slice(0, 60);
}

function isLikelyUserFacing(str: string): boolean {
  const t = str.trim();
  if (t.length < MIN_STRING_LENGTH || t.length > MAX_STRING_LENGTH)
    return false;
  if (!/[A-Za-z]/.test(t)) return false;
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(t)) return false;
  }
  for (const pattern of CODE_LIKE_PATTERNS) {
    if (pattern.test(t)) return false;
  }
  if (/^[a-z][a-z-]*$/.test(t) && t.length < 4) return false;
  if (t.includes(");") || t.includes(".test(")) return false;
  return true;
}

function extractJsxText(content: string): string[] {
  const found = new Set<string>();
  const jsxTextRegex = />\s*([A-Za-z][^<{}]*?)\s*[<{]/g;
  let m: RegExpExecArray | null;
  while ((m = jsxTextRegex.exec(content)) !== null) {
    const raw = m[1].trim();
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (isLikelyUserFacing(normalized)) found.add(normalized);
  }
  return [...found];
}

function extractQuotedStringsInJsxContext(content: string): string[] {
  const found = new Set<string>();
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.includes("t(") && /t\s*\(\s*["'`]/.test(line)) continue;
    if (line.includes("className") && /className\s*=\s*["'`]/.test(line))
      continue;
    if (/import\s+.+from\s+["'`]/.test(line)) continue;
    const stringLiteralRegex = /["']([A-Za-z][^"']{1,200})["']/g;
    let m: RegExpExecArray | null;
    while ((m = stringLiteralRegex.exec(line)) !== null) {
      const s = m[1];
      if (/[\s:]/.test(s) || (s.length >= 3 && /[A-Z]/.test(s))) {
        const normalized = s.replace(/\s+/g, " ").trim();
        if (isLikelyUserFacing(normalized) && !s.includes("."))
          found.add(normalized);
      }
    }
  }
  return [...found];
}

function collectHardcodedStrings(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const candidates = new Set<string>();
  for (const s of extractJsxText(content)) {
    candidates.add(s);
  }
  for (const s of extractQuotedStringsInJsxContext(content)) {
    candidates.add(s);
  }
  return [...candidates];
}

function* walkTsxTs(dir: string): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "locales") continue;
      yield* walkTsxTs(full);
    } else if (e.isFile() && /\.(tsx|ts)$/.test(e.name)) {
      yield full;
    }
  }
}

function ensureUniqueKeys(
  missing: TranslationObject,
  newEntries: Array<{ key: string; value: string }>,
): TranslationObject {
  const result = { ...missing };
  const used = new Set<string>(Object.keys(result));

  for (const { key: _key, value } of newEntries) {
    let k = stringToKey(value);
    if (!k) k = "unknown";
    let finalKey = k;
    let n = 0;
    while (used.has(finalKey)) {
      n += 1;
      finalKey = `${k}_${n}`;
    }
    used.add(finalKey);
    result[finalKey] = value;
  }
  return result;
}

function sortKeys(obj: TranslationObject): TranslationObject {
  const sorted: TranslationObject = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    sorted[key] = isObject(value) ? sortKeys(value) : value;
  }
  return sorted;
}

async function main(): Promise<void> {
  const enContent = readFileSync(ENGLISH_FILE, "utf-8");
  const en = JSON.parse(enContent) as TranslationObject;
  const existingValues = getAllEnglishValues(en);

  const allCandidates = new Set<string>();
  for (const filePath of walkTsxTs(DESKTOP_SRC)) {
    for (const s of collectHardcodedStrings(filePath)) {
      if (!existingValues.has(s)) allCandidates.add(s);
    }
  }

  const toAdd = [...allCandidates].filter((s) => isLikelyUserFacing(s)).sort();

  if (toAdd.length === 0) {
    console.log("No missing hardcoded strings found.");
    return;
  }

  const missing = (en.missing as TranslationObject) ?? {};
  const newEntries = toAdd.map((value) => ({
    key: stringToKey(value),
    value,
  }));
  const mergedMissing = ensureUniqueKeys(missing, newEntries);
  const sortedMissing = sortKeys(mergedMissing);

  const newEn = { ...en, missing: sortedMissing };
  const output = JSON.stringify(sortKeys(newEn), null, 2);
  writeFileSync(ENGLISH_FILE, `${output}\n`, "utf-8");

  console.log(
    `Added ${toAdd.length} missing string(s) to en/translation.json under "missing":`,
  );
  for (const v of toAdd.slice(0, 30)) {
    console.log(`  - ${v}`);
  }
  if (toAdd.length > 30) {
    console.log(`  ... and ${toAdd.length - 30} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
