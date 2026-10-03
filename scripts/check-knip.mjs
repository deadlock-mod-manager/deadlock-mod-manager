import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{name: string, namespace?: string}} SymbolIssue */
/** @typedef {{file: string, owners?: {name: string}[]} & Record<string, SymbolIssue[] | SymbolIssue[][] | string>} IssueRow */
/** @typedef {{issues: IssueRow[]}} KnipReport */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "knip-baseline.txt");

/** @param {KnipReport} report */
export function findingKeys(report) {
  const keys = [];
  for (const row of report.issues) {
    for (const [category, issues] of Object.entries(row)) {
      if (category === "file" || category === "owners") continue;
      if (!Array.isArray(issues)) throw new Error("Invalid Knip issue list");
      for (const issue of issues) {
        const symbols = Array.isArray(issue) ? issue : [issue];
        keys.push(
          JSON.stringify([
            category,
            row.file.replaceAll("\\", "/"),
            symbols
              .map((symbol) => [
                symbol.namespace ?? "",
                symbol.name.replaceAll("\\", "/"),
              ])
              .sort(),
          ]),
        );
      }
    }
  }
  return [...new Set(keys)].sort();
}

/** @param {string[]} findings @param {string[]} baseline */
export function compareFindings(findings, baseline) {
  const accepted = new Set(baseline);
  const current = new Set(findings);
  return {
    added: findings.filter((key) => !accepted.has(key)),
    removed: baseline.filter((key) => !current.has(key)),
  };
}

/** @param {import("node:child_process").SpawnSyncReturns<string>} result */
export function readKnipResult(result) {
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Knip failed (exit ${result.status}): ${result.stderr}`);
  /** @type {KnipReport} */
  const report = JSON.parse(result.stdout);
  return findingKeys(report);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--update-baseline") || args.length > 1)
    throw new Error("Usage: node scripts/check-knip.mjs [--update-baseline]");
  const findings = readKnipResult(
    spawnSync(
      process.execPath,
      [
        join(root, "node_modules/knip/bin/knip.js"),
        "--config",
        "knip.json",
        "--reporter",
        "json",
        "--no-exit-code",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ),
  );
  if (args.includes("--update-baseline")) {
    await writeFile(baselinePath, findings.join("\n") + "\n");
    console.info(
      `Recorded ${findings.length} Knip findings. Review the baseline diff before committing.`,
    );
    return;
  }
  const baseline = (await readFile(baselinePath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  const { added, removed } = compareFindings(findings, baseline);
  if (added.length || removed.length) {
    for (const key of added) console.error(`New Knip finding: ${key}`);
    console.error(
      `${added.length} new, ${removed.length} resolved findings. Fix new findings; run pnpm knip:baseline and review the diff after cleanup.`,
    );
    process.exitCode = 1;
    return;
  }
  console.info(
    `Knip passed: ${findings.length} existing findings, no changes to the reviewed baseline.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
