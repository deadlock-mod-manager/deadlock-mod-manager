import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{path: string, added: string[], removed: string[]}} Hunk */
/** @typedef {{path: string, commit: string}} Reversion */

/** @param {string} patch */
function readHunks(patch) {
  /** @type {Hunk[]} */
  const hunks = [];
  let oldPath = "";
  let path = "";
  /** @type {Hunk | undefined} */
  let hunk;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      oldPath = "";
      path = "";
      hunk = undefined;
    } else if (!hunk && line.startsWith("--- ")) {
      oldPath = readPath(line.slice(4));
    } else if (!hunk && line.startsWith("+++ ")) {
      path = line.slice(4) === "/dev/null" ? oldPath : readPath(line.slice(4));
    } else if (line.startsWith("@@ ")) {
      hunk = { path, added: [], removed: [] };
      hunks.push(hunk);
    } else if (hunk && line.startsWith("+")) {
      hunk.added.push(line.slice(1).trimEnd());
    } else if (hunk && line.startsWith("-")) {
      hunk.removed.push(line.slice(1).trimEnd());
    }
  }
  return hunks;
}

/** @param {string} path */
function readPath(path) {
  if (!path.startsWith('"')) {
    const separator = path.indexOf("\t");
    return path.slice(2, separator < 0 ? undefined : separator);
  }
  // Git quotes UTF-8 bytes with C octal escapes rather than JSON escapes.
  const json = path.replace(/\\(?:[0-7]{1,3}|.)/g, (escape) => {
    if (/^\\[0-7]/.test(escape)) {
      return `\\u${Number.parseInt(escape.slice(1), 8).toString(16).padStart(4, "0")}`;
    }
    if (escape === "\\a") return "\\u0007";
    if (escape === "\\v") return "\\u000b";
    return escape;
  });
  /** @type {string} */
  const decoded = Buffer.from(JSON.parse(json), "latin1").toString("utf8");
  return decoded.slice(2);
}

/** @param {string[]} lines @param {string[]} block */
function containsBlock(lines, block) {
  if (block.length === 0) return true;
  return lines.some((_, start) =>
    block.every((line, offset) => lines[start + offset] === line),
  );
}

/**
 * Compare a proposed result tree with the base it will replace. In CI the head
 * is GitHub's merge result, so an unmerged branch's stale files are not losses.
 * @param {{cwd: string, base: string, head: string}} options
 */
export function findRecentReversions({ cwd, base, head }) {
  /** @param {string[]} args */
  const git = (args) =>
    execFileSync("git", ["-c", "core.quotePath=true", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trimEnd();
  const baseCommit = git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${base}^{commit}`,
  ]);
  const headCommit = git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${head}^{commit}`,
  ]);
  const diffOptions = [
    "--no-ext-diff",
    "--no-color",
    "--no-renames",
    "--unified=0",
  ];
  const proposed = readHunks(
    git(["diff", ...diffOptions, baseCommit, headCommit]),
  );
  if (proposed.length === 0) return [];
  const commits = git([
    "log",
    "--first-parent",
    "--since=7.days",
    "--max-count=300",
    "--format=%H",
    baseCommit,
  ])
    .split("\n")
    .filter(Boolean);
  /** @type {Reversion[]} */
  const findings = [];
  for (const commit of commits) {
    const recent = readHunks(
      git([
        "show",
        "--format=",
        "--first-parent",
        "--diff-merges=first-parent",
        ...diffOptions,
        commit,
      ]),
    );
    /** @type {Set<string>} */
    const paths = new Set();
    for (const original of recent) {
      if (
        original.path.startsWith(".changeset/") &&
        original.path.endsWith(".md")
      )
        continue;
      if (
        ![...original.added, ...original.removed].some((line) =>
          /[\p{L}\p{N}]/u.test(line),
        )
      )
        continue;
      if (
        proposed.some(
          (candidate) =>
            candidate.path === original.path &&
            containsBlock(candidate.removed, original.added) &&
            containsBlock(candidate.added, original.removed),
        )
      )
        paths.add(original.path);
    }
    for (const path of paths) findings.push({ path, commit });
  }
  return findings;
}

/** @param {string} value */
function escapeAnnotation(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(",", "%2C")
    .replaceAll(":", "%3A");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const base = process.argv[2] ?? process.env.BASE_SHA;
  const head = process.argv[3] ?? process.env.HEAD_SHA;
  if (!base || !head)
    throw new Error(
      "Provide base and head commit refs as arguments or BASE_SHA/HEAD_SHA.",
    );
  const findings = findRecentReversions({ cwd: process.cwd(), base, head });
  for (const { path, commit } of findings.slice(0, 20)) {
    console.log(
      `::warning file=${escapeAnnotation(path)},title=Possible recent reversion::This change reverses a patch hunk from ${commit}. Check that the removal is intentional.`,
    );
  }
  console.log(
    `${findings.length} suspected recent reversions; advisory only. Exact patch matching cannot detect every lost behavior.`,
  );
}
