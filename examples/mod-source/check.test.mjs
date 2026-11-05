import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkSource } from "./check.mjs";

const example = dirname(fileURLToPath(import.meta.url));

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "dmm-source-example-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(example, directory, { recursive: true });
  return directory;
}

async function edit(directory, filename, change) {
  const path = join(directory, filename);
  const document = JSON.parse(await readFile(path, "utf8"));
  change(document);
  await writeFile(path, `${JSON.stringify(document)}\n`);
}

test("copyable example resolves its listing and verifies the shipped artifact", async () => {
  assert.deepEqual(await checkSource(example), {
    sourceId: "my-community",
    snapshotId: "example-1",
    listings: 1,
    artifacts: 1,
  });
});

test("publisher changing bytes without updating the digest fails preflight", async (t) => {
  const directory = await fixture(t);
  const artifactPath = join(directory, "files/example.vpk");
  const artifact = await readFile(artifactPath);
  await writeFile(artifactPath, artifact.fill(0));
  await assert.rejects(checkSource(directory), /sha256 mismatch/);
});

test("a later page from a different snapshot fails the complete catalog", async (t) => {
  const directory = await fixture(t);
  await edit(directory, "catalog.json", (page) => {
    page.nextUrl = "./page-2.json";
  });
  await writeFile(
    join(directory, "page-2.json"),
    JSON.stringify({ snapshotId: "different", items: [] }),
  );
  await assert.rejects(checkSource(directory), /share one snapshotId/);
});

test("duplicate artifact IDs are rejected before publication", async (t) => {
  const directory = await fixture(t);
  await edit(directory, "mods/example.json", (detail) => {
    detail.release.artifacts.push(detail.release.artifacts[0]);
  });
  await assert.rejects(checkSource(directory), /Duplicate artifact ID/);
});

test("detail identity must match the index", async (t) => {
  const directory = await fixture(t);
  await edit(directory, "mods/example.json", (detail) => {
    detail.id = "other";
  });
  await assert.rejects(checkSource(directory), /identity differs/);
});

test("catalog pagination cannot loop forever", async (t) => {
  const directory = await fixture(t);
  await edit(directory, "catalog.json", (page) => {
    page.nextUrl = "./catalog.json";
  });
  await assert.rejects(checkSource(directory), /page loop/);
});

test("optional component example has satisfiable defaults and a verified archive", async (t) => {
  const directory = await fixture(t);
  await edit(directory, "catalog.json", (page) => {
    page.items.push({
      id: "choices",
      title: "Harmless component choices",
      availability: "available",
      detailUrl: "./mods/choices.json",
    });
  });
  const result = await checkSource(directory);
  assert.equal(result.listings, 2);
  assert.equal(result.artifacts, 2);
  await edit(directory, "mods/choices.json", (detail) => {
    detail.release.installation.choiceGroups[0].defaultComponentIds = ["base"];
  });
  await assert.rejects(checkSource(directory), /outside its choice group/);
});
