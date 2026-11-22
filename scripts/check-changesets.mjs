import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A changeset becomes one release-notes line, so it gets one sentence. */
const MAX_LENGTH = 160;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesetDir = join(root, ".changeset");

/** @param {string} source */
const changesetBody = (source) =>
  source
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/\s+/g, " ")
    .trim();

const paths =
  process.argv.length > 2
    ? process.argv.slice(2).map((path) => resolve(path))
    : (await readdir(changesetDir))
        .filter((name) => name.endsWith(".md") && name !== "README.md")
        .map((name) => join(changesetDir, name));

const tooLong = [];
for (const path of paths) {
  if (basename(path) === "README.md") continue;
  const body = changesetBody(await readFile(path, "utf8"));
  if (body.length > MAX_LENGTH) {
    tooLong.push(`${basename(path)}: ${body.length} characters`);
  }
}

if (tooLong.length > 0) {
  console.error(
    `Changesets must be at most ${MAX_LENGTH} characters, about one sentence:\n  ${tooLong.join("\n  ")}`,
  );
  process.exit(1);
}
