/* oxlint-disable anti-slop/no-runtime-typeof -- This dependency-free example validates untrusted taxonomy JSON at the network boundary. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Validate first, then atomically replace the last good taxonomy copy. */
export async function syncTaxonomy(url, destination) {
  const response = await fetch(url);
  assert.ok(response.ok, `Taxonomy request failed: HTTP ${response.status}`);
  const taxonomy = await response.json();
  assert.equal(taxonomy.format, "dmm-taxonomy");
  assert.equal(taxonomy.version, 1, "Unsupported taxonomy version");
  for (const entries of [taxonomy.heroes, taxonomy.contentTypes]) {
    assert.ok(Array.isArray(entries) && entries.length > 0);
    const ids = new Set();
    for (const entry of entries) {
      assert.equal(typeof entry.id, "string");
      assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(typeof entry.name, "string");
      assert.ok(entry.name.trim().length > 0);
      assert.ok(!ids.has(entry.id), "Duplicate taxonomy ID");
      ids.add(entry.id);
    }
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(taxonomy, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return taxonomy;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const destination = resolve(process.argv[2] ?? "taxonomy.json");
  const taxonomy = await syncTaxonomy(
    process.env.TAXONOMY_URL ?? "https://deadlockmods.app/v1/taxonomy.json",
    destination,
  );
  process.stdout.write(
    `Saved ${taxonomy.heroes.length} heroes and ${taxonomy.contentTypes.length} content types to ${destination}\n`,
  );
}
