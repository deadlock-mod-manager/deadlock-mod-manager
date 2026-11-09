import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createExampleServer } from "./server.mjs";
import { syncTaxonomy } from "./sync-taxonomy.mjs";

async function listen(t, server) {
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t) {
  const server = await createExampleServer(
    fileURLToPath(new URL("../mod-source/", import.meta.url)),
    "https://mods.example.org",
  );
  return listen(t, server);
}

test("API catalog completes across pages and resolves both release modes", async (t) => {
  const base = await fixture(t);
  const descriptor = await fetch(`${base}/.well-known/dmm-source.json`).then(
    (r) => r.json(),
  );
  assert.equal(descriptor.format, "dmm-source");
  assert.equal(descriptor.catalog.kind, "api");
  assert.deepEqual(descriptor.networkOrigins.api, ["https://mods.example.org"]);
  const first = await fetch(`${base}/dmm/v1/mods`).then((r) => r.json());
  assert.equal(first.nextCursor, "second-page");
  const second = await fetch(
    `${base}/dmm/v1/mods?cursor=${first.nextCursor}&limit=100`,
  ).then((r) => r.json());
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    second.items.find((item) => item.id === "retired-example"),
    {
      id: "retired-example",
      availability: "removed",
    },
  );
  for (const item of [...first.items, ...second.items]) {
    if (item.availability === "removed") continue;
    const detail = await fetch(
      new URL(new URL(item.detailUrl).pathname, base),
    ).then((r) => r.json());
    assert.equal(detail.id, item.id);
    assert.equal(detail.isNsfw, false);
    const release =
      detail.release ??
      (await fetch(new URL(new URL(detail.releaseUrl).pathname, base)).then(
        (r) => r.json(),
      ));
    assert.ok(release.artifacts.length > 0);
    if (item.id === "choices") {
      assert.equal(release.installation.mode, "components");
      assert.deepEqual(release.installation.requiredComponents, ["base"]);
      assert.deepEqual(
        release.installation.choiceGroups[0].defaultComponentIds,
        ["blue"],
      );
    }
    const history = await fetch(`${base}/dmm/v1/mods/${item.id}/releases`).then(
      (r) => r.json(),
    );
    assert.equal(history.nextCursor, null);
    assert.equal(history.items[0].id, release.id);
    for (const artifact of release.artifacts) {
      let download = artifact.download.url;
      if (!download) {
        const resolution = await fetch(
          new URL(new URL(artifact.download.resolverUrl).pathname, base),
        ).then((r) => r.json());
        download = resolution.url;
      }
      assert.ok(
        descriptor.networkOrigins.downloads.includes(new URL(download).origin),
      );
      const response = await fetch(new URL(new URL(download).pathname, base));
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, artifact.size);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        artifact.hashes.sha256,
      );
    }
  }
});

test("renamed listing and artifact IDs resolve the renamed fixture bytes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dmm-api-renamed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(
    fileURLToPath(new URL("../mod-source/", import.meta.url)),
    directory,
    {
      recursive: true,
    },
  );
  const filename = "renamed fixture #1.vpk";
  const detailPath = join(directory, "mods", "example.json");
  const listing = JSON.parse(await readFile(detailPath, "utf8"));
  listing.id = "renamed listing / 1";
  const artifact = listing.release.artifacts[0];
  artifact.id = "renamed artifact / 1";
  await rename(
    join(directory, "files", artifact.filename),
    join(directory, "files", filename),
  );
  artifact.filename = filename;
  await writeFile(detailPath, JSON.stringify(listing));
  const base = await listen(
    t,
    await createExampleServer(directory, "https://mods.example.org"),
  );
  const page = await fetch(`${base}/dmm/v1/mods`).then((r) => r.json());
  const detail = await fetch(
    new URL(new URL(page.items[0].detailUrl).pathname, base),
  ).then((r) => r.json());
  assert.equal(detail.id, listing.id);
  const release = await fetch(
    new URL(new URL(detail.releaseUrl).pathname, base),
  ).then((r) => r.json());
  const resolverUrl = new URL(release.artifacts[0].download.resolverUrl);
  assert.ok(resolverUrl.pathname.includes(encodeURIComponent(artifact.id)));
  const resolution = await fetch(new URL(resolverUrl.pathname, base)).then(
    (r) => r.json(),
  );
  assert.equal(
    new URL(resolution.url).pathname,
    `/files/${encodeURIComponent(filename)}`,
  );
  const response = await fetch(new URL(new URL(resolution.url).pathname, base));
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    await readFile(join(directory, "files", filename)),
  );
});

test("invalid cursors, missing files and unsupported methods fail explicitly", async (t) => {
  const base = await fixture(t);
  assert.equal((await fetch(`${base}/dmm/v1/mods?cursor=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/files/missing.vpk`)).status, 404);
  assert.equal(
    (await fetch(`${base}/dmm/v1/mods`, { method: "POST" })).status,
    405,
  );
});

test("taxonomy sync preserves the saved copy on HTTP and validation failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dmm-taxonomy-example-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "taxonomy.json");
  const taxonomy = {
    format: "dmm-taxonomy",
    version: 1,
    heroes: [{ id: "abrams", name: "Abrams" }],
    contentTypes: [{ id: "skins", name: "Skins" }],
  };
  let status = 200;
  let document = taxonomy;
  const base = await listen(
    t,
    createServer((_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(document));
    }),
  );
  await writeFile(destination, "previous copy");
  status = 503;
  await assert.rejects(syncTaxonomy(base, destination), /HTTP 503/);
  assert.equal(await readFile(destination, "utf8"), "previous copy");
  status = 200;
  document = { ...taxonomy, version: 2 };
  await assert.rejects(
    syncTaxonomy(base, destination),
    /Unsupported taxonomy version/,
  );
  assert.equal(await readFile(destination, "utf8"), "previous copy");
  document = { ...taxonomy, heroes: [...taxonomy.heroes, ...taxonomy.heroes] };
  await assert.rejects(
    syncTaxonomy(base, destination),
    /Duplicate taxonomy ID/,
  );
  assert.equal(await readFile(destination, "utf8"), "previous copy");
  document = taxonomy;
  assert.deepEqual(await syncTaxonomy(base, destination), taxonomy);
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), taxonomy);
});
