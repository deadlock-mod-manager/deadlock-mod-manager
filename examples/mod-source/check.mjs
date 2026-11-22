/* oxlint-disable anti-slop/no-runtime-typeof -- This standalone author preflight is the untrusted JSON decoding boundary and has no runtime dependencies. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const supportedFormats = new Set(["vpk", "zip", "rar", "7z"]);

function checkInstallation(installation, artifactIds) {
  if (installation.mode === "manual") return;
  assert.equal(
    installation.mode,
    "components",
    "Unsupported installation mode",
  );
  const components = new Set();
  for (const component of installation.components) {
    assert.ok(
      component.id && !components.has(component.id),
      "Duplicate or missing component ID",
    );
    components.add(component.id);
    assert.ok(component.files.length > 0, "Component must contain files");
    for (const file of component.files) {
      assert.ok(
        artifactIds.has(file.artifactId),
        "Component references missing artifact",
      );
      assert.ok(
        typeof file.path === "string" && file.path.length > 0,
        "Missing component path",
      );
      assert.ok(
        !file.path.startsWith("/") &&
          !file.path.includes("\\") &&
          !file.path.includes(":"),
        "Invalid component path",
      );
      assert.ok(
        file.path
          .split("/")
          .every((part) => part && part !== "." && part !== ".."),
        "Unsafe component path",
      );
    }
  }
  const assigned = new Set();
  function assign(id) {
    assert.ok(
      components.has(id) && !assigned.has(id),
      "Component must belong to exactly one required set or choice group",
    );
    assigned.add(id);
  }
  for (const id of installation.requiredComponents ?? []) assign(id);
  const groups = new Set();
  for (const group of installation.choiceGroups ?? []) {
    assert.ok(
      group.id && !groups.has(group.id),
      "Duplicate or missing choice group ID",
    );
    groups.add(group.id);
    const defaults = new Set(group.defaultComponentIds);
    assert.ok(
      Number.isInteger(group.minSelections) &&
        Number.isInteger(group.maxSelections),
      "Choice bounds must be integers",
    );
    assert.ok(
      group.minSelections >= 0 &&
        group.minSelections <= group.maxSelections &&
        group.maxSelections <= group.componentIds.length,
      "Unsatisfiable choice bounds",
    );
    assert.ok(
      defaults.size === group.defaultComponentIds.length &&
        defaults.size >= group.minSelections &&
        defaults.size <= group.maxSelections,
      "Invalid default choices",
    );
    for (const id of defaults)
      assert.ok(
        group.componentIds.includes(id),
        "Default is outside its choice group",
      );
    for (const id of group.componentIds) assign(id);
  }
  assert.equal(
    assigned.size,
    components.size,
    "Every component must be required or in a choice group",
  );
}

/** Offline preflight for this copyable static subset; DMM validates again. */
export async function checkSource(directory) {
  const root = await realpath(directory);
  const descriptorPath = resolve(root, "dmm-source.json");
  const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
  assert.equal(
    descriptor.format,
    "dmm-source",
    "Unsupported descriptor format",
  );
  assert.equal(
    descriptor.protocolVersion,
    "1.0",
    "Unsupported protocol version",
  );
  assert.equal(descriptor.gameId, "deadlock", "Only Deadlock is supported");
  assert.equal(
    descriptor.catalog.kind,
    "static",
    "This tool checks static sources",
  );
  for (const field of ["sourceId", "name"]) {
    assert.ok(
      typeof descriptor[field] === "string" && descriptor[field].trim(),
      `Missing ${field}`,
    );
  }
  for (const category of ["api", "downloads", "media"]) {
    assert.ok(
      Array.isArray(descriptor.networkOrigins[category]),
      `Missing ${category} origins`,
    );
    for (const origin of descriptor.networkOrigins[category]) {
      const url = new URL(origin);
      assert.equal(url.protocol, "https:", "Published origins must use HTTPS");
      assert.equal(
        url.origin,
        origin,
        "Declare origins without paths or trailing slashes",
      );
    }
  }

  async function localDocument(containingPath, reference, category) {
    assert.ok(
      typeof reference === "string" && reference.length > 0,
      "Missing document URL",
    );
    // This example deploys one directory to one origin. Keep preflight offline.
    assert.ok(
      !reference.startsWith("/") && !reference.includes(":"),
      "Use relative URLs in the copyable example",
    );
    const target = await realpath(resolve(dirname(containingPath), reference));
    const rel = relative(root, target);
    assert.ok(
      !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`),
      "Reference escapes source directory",
    );
    assert.ok(
      descriptor.networkOrigins[category].length > 0,
      `No accepted ${category} origin`,
    );
    return target;
  }

  let pagePath = await localDocument(
    descriptorPath,
    descriptor.catalog.indexUrl,
    "api",
  );
  let snapshot;
  let listings = 0;
  let artifacts = 0;
  const pages = new Set();
  const ids = new Set();
  while (pagePath) {
    assert.ok(!pages.has(pagePath), "Catalog page loop");
    assert.ok(pages.size < 100, "Too many catalog pages");
    pages.add(pagePath);
    const page = JSON.parse(await readFile(pagePath, "utf8"));
    assert.ok(
      typeof page.snapshotId === "string" && page.snapshotId,
      "Missing snapshotId",
    );
    snapshot ??= page.snapshotId;
    assert.equal(
      page.snapshotId,
      snapshot,
      "Catalog pages must share one snapshotId",
    );
    assert.ok(Array.isArray(page.items), "Catalog items must be an array");
    for (const summary of page.items) {
      assert.ok(
        typeof summary.id === "string" && summary.id,
        "Missing listing ID",
      );
      assert.ok(!ids.has(summary.id), "Duplicate listing ID");
      ids.add(summary.id);
      const detailPath = await localDocument(
        pagePath,
        summary.detailUrl,
        "api",
      );
      const detail = JSON.parse(await readFile(detailPath, "utf8"));
      assert.equal(
        detail.id,
        summary.id,
        "Detail listing identity differs from index",
      );
      assert.ok(
        typeof detail.title === "string" && detail.title,
        "Missing listing title",
      );
      assert.ok(
        ["available", "unavailable", "removed"].includes(detail.availability),
        "Invalid availability",
      );
      if (detail.isNsfw !== undefined && detail.isNsfw !== null) {
        assert.equal(
          typeof detail.isNsfw,
          "boolean",
          "isNsfw must be boolean or absent",
        );
      }
      listings += 1;
      if (detail.availability !== "available") continue;
      const release = detail.release;
      assert.ok(
        typeof release.id === "string" && release.id,
        "Missing release ID",
      );
      assert.ok(
        typeof release.contentRevision === "string" && release.contentRevision,
        "Missing content revision",
      );
      assert.ok(
        Array.isArray(release.artifacts) && release.artifacts.length > 0,
        "Available release needs artifacts",
      );
      const artifactIds = new Set();
      for (const artifact of release.artifacts) {
        assert.ok(
          typeof artifact.id === "string" && artifact.id,
          "Missing artifact ID",
        );
        assert.ok(!artifactIds.has(artifact.id), "Duplicate artifact ID");
        artifactIds.add(artifact.id);
        assert.ok(
          supportedFormats.has(artifact.format),
          "Unsupported package format",
        );
        assert.ok(
          typeof artifact.filename === "string" &&
            !/[\\/]/.test(artifact.filename) &&
            artifact.filename.endsWith(`.${artifact.format}`),
          "Artifact filename must be a basename with a matching lowercase extension",
        );
        const artifactPath = await localDocument(
          detailPath,
          artifact.download.url,
          "downloads",
        );
        const bytes = await readFile(artifactPath);
        if (artifact.size !== undefined)
          assert.equal(bytes.length, artifact.size, "Artifact size mismatch");
        for (const algorithm of ["sha256", "md5"]) {
          const expected = artifact.hashes?.[algorithm];
          if (expected !== undefined) {
            assert.equal(
              createHash(algorithm).update(bytes).digest("hex"),
              expected.toLowerCase(),
              `${algorithm} mismatch`,
            );
          }
        }
        artifacts += 1;
      }
      checkInstallation(release.installation, artifactIds);
    }
    pagePath = page.nextUrl
      ? await localDocument(pagePath, page.nextUrl, "api")
      : undefined;
  }
  return {
    sourceId: descriptor.sourceId,
    snapshotId: snapshot,
    listings,
    artifacts,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await checkSource(process.argv[2] ?? dirname(process.argv[1]));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
