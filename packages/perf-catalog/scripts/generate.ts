/**
 * Generates `data/catalog.json` from the pins in `sources.json` and the curated
 * layer in `curated/`.
 *
 *   bun packages/perf-catalog/scripts/generate.ts            regenerate
 *   bun packages/perf-catalog/scripts/generate.ts --check    fail if the committed file is stale
 *   bun packages/perf-catalog/scripts/generate.ts --refresh  move pins to the newest upstream state
 *       [--summary <file>]                                   write a markdown summary (CI)
 *
 * Set GITHUB_TOKEN (or GH_TOKEN) for `--refresh`; GitHub's unauthenticated API
 * limit is too low for the stock history.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Catalog, catalogSchema } from "../src/schema";
import { buildCatalog } from "./lib/build";
import { PACKAGE_DIR } from "./lib/fetch";
import { refreshSources } from "./lib/refresh";
import { readSources, writeSources } from "./lib/sources";

const CATALOG_PATH = join(PACKAGE_DIR, "data", "catalog.json");
const SIZE_BUDGET = 2.5 * 1024 * 1024;

const args = process.argv.slice(2);
const check = args.includes("--check");
const refresh = args.includes("--refresh");
const summaryIndex = args.indexOf("--summary");
const summaryPath = summaryIndex >= 0 ? args[summaryIndex + 1] : undefined;

/** Catalog text without the fields that change on every run. */
const comparable = (catalog: Catalog): string =>
  JSON.stringify({ ...catalog, version: "", generatedAt: "" });

const nextVersion = (previous: string | undefined, now: Date): string => {
  const date = now.toISOString().slice(0, 10).replaceAll("-", ".");
  const [previousDate, counter] = (previous ?? "").split("-");
  return previousDate === date ? `${date}-${Number(counter) + 1}` : `${date}-1`;
};

const describeDifferences = (before: Catalog, after: Catalog): string[] => {
  const out: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<
    keyof Catalog
  >;
  for (const key of keys) {
    if (key === "version" || key === "generatedAt") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      out.push(`${key} changed`);
  }
  const beforePresets = new Map(
    (before.presets ?? []).map((preset) => [preset.id, preset]),
  );
  for (const preset of after.presets ?? []) {
    const old = beforePresets.get(preset.id);
    if (!old)
      out.push(`preset ${preset.id} added (${preset.entries.length} entries)`);
    else if (JSON.stringify(old) !== JSON.stringify(preset)) {
      out.push(
        `preset ${preset.id}: ${old.entries.length} → ${preset.entries.length} entries`,
      );
    }
  }
  return out;
};

const main = async () => {
  let sources = readSources();
  let pinChanges: string[] = [];
  if (refresh) {
    const refreshed = await refreshSources(sources);
    sources = refreshed.sources;
    pinChanges = refreshed.changes;
    writeSources(sources);
    console.log(
      pinChanges.length > 0
        ? `Pins moved:\n  ${pinChanges.join("\n  ")}`
        : "Pins unchanged.",
    );
  }

  const { catalog, report } = await buildCatalog(sources);
  const existing: Catalog | null = existsSync(CATALOG_PATH)
    ? JSON.parse(readFileSync(CATALOG_PATH, "utf8"))
    : null;
  const unchanged =
    existing !== null && comparable(existing) === comparable(catalog);

  if (unchanged) {
    catalog.version = existing.version;
    catalog.generatedAt = existing.generatedAt;
  } else {
    const now = new Date();
    catalog.version = nextVersion(existing?.version, now);
    catalog.generatedAt = now.toISOString();
  }
  catalogSchema.parse(catalog);

  const text = `${JSON.stringify(catalog)}\n`;
  const size = Buffer.byteLength(text);
  report.lines.push(`Catalog size: ${(size / 1024 / 1024).toFixed(2)} MB`);
  if (size > SIZE_BUDGET)
    throw new Error(
      `Catalog is ${size} bytes, over the ${SIZE_BUDGET} byte budget`,
    );

  for (const line of report.lines) console.log(line);
  const differences =
    existing && !unchanged ? describeDifferences(existing, catalog) : [];

  if (check) {
    if (!unchanged) {
      console.error(
        `data/catalog.json is stale:\n  ${differences.join("\n  ") || "new file"}`,
      );
      process.exit(1);
    }
    console.log("data/catalog.json is up to date.");
    return;
  }

  if (unchanged) {
    console.log(`data/catalog.json unchanged (${catalog.version}).`);
  } else {
    writeFileSync(CATALOG_PATH, text);
    console.log(
      `Wrote data/catalog.json ${catalog.version}${differences.length ? `:\n  ${differences.join("\n  ")}` : ""}`,
    );
  }

  if (summaryPath) {
    const summary = [
      `Catalog ${catalog.version}${unchanged ? " (unchanged)" : ""}.`,
      "",
      "### Pins",
      ...(pinChanges.length > 0
        ? pinChanges.map((line) => `- ${line}`)
        : ["- unchanged"]),
      "",
      "### Catalog",
      ...(differences.length > 0
        ? differences.map((line) => `- ${line}`)
        : ["- no content changes"]),
      "",
      "### Generator report",
      "```",
      ...report.lines,
      "```",
      "",
    ].join("\n");
    writeFileSync(summaryPath, summary);
  }
};

await main();
