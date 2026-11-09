import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

function sendJson(response, status, document) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(document));
}

/** A fixture-backed public API example, not an upload or publishing service. */
export async function createExampleServer(fixtureDirectory, publicOrigin) {
  const origin = new URL(publicOrigin);
  assert.ok(["http:", "https:"].includes(origin.protocol));
  assert.equal(origin.pathname, "/", "Supply an origin without a path");
  assert.equal(origin.search, "");
  assert.equal(origin.hash, "");
  assert.equal(origin.username, "");
  assert.equal(origin.password, "");

  const listings = await Promise.all(
    ["example", "choices"].map(async (id) => {
      const listing = JSON.parse(
        await readFile(resolve(fixtureDirectory, "mods", `${id}.json`), "utf8"),
      );
      listing.hero = "abrams";
      listing.contentType = "skins";
      listing.updatedAt = "2026-11-01T12:00:00Z";
      listing.release.publishedAt = listing.updatedAt;
      listing.release.changelog = "First example release.";
      for (const artifact of listing.release.artifacts) {
        assert.equal(basename(artifact.filename), artifact.filename);
        artifact.download = {
          url: new URL(
            `/files/${encodeURIComponent(artifact.filename)}`,
            origin,
          ).href,
        };
      }
      return listing;
    }),
  );
  // Resolve this artifact on demand; the components example uses direct URLs.
  const resolvedArtifact = listings[0].release.artifacts[0];
  const resolverPath = `/dmm/v1/files/${encodeURIComponent(resolvedArtifact.id)}/resolve`;
  resolvedArtifact.download = {
    resolverUrl: new URL(resolverPath, origin).href,
  };
  const removed = { id: "retired-example", availability: "removed" };
  const files = new Map(
    listings.flatMap((listing) =>
      listing.release.artifacts.map((artifact) => [
        `/files/${encodeURIComponent(artifact.filename)}`,
        artifact,
      ]),
    ),
  );

  const descriptor = {
    format: "dmm-source",
    protocolVersion: "1.0",
    sourceId: "my-community",
    name: "Example Community",
    gameId: "deadlock",
    catalog: {
      kind: "api",
      listUrl: new URL("/dmm/v1/mods", origin).href,
      releaseHistoryUrlTemplate: `${origin.origin}/dmm/v1/mods/{listingId}/releases`,
    },
    networkOrigins: {
      api: [origin.origin],
      downloads: [origin.origin],
      media: [],
    },
    capabilities: {
      search: "local",
      releaseHistory: true,
      installationChoices: true,
    },
  };

  async function handle(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: "Use GET" });
      return;
    }
    const url = new URL(request.url, origin);
    if (url.pathname === "/.well-known/dmm-source.json") {
      sendJson(response, 200, descriptor);
      return;
    }
    if (url.pathname === "/dmm/v1/mods") {
      const cursor = url.searchParams.get("cursor");
      if (cursor !== null && cursor !== "second-page") {
        sendJson(response, 400, { error: "Invalid cursor" });
        return;
      }
      const page = cursor === null ? [listings[0]] : [listings[1]];
      sendJson(response, 200, {
        items: [
          ...page.map(({ id, title, isNsfw }) => ({
            id,
            title,
            isNsfw,
            availability: "available",
            detailUrl: new URL(`/dmm/v1/mods/${encodeURIComponent(id)}`, origin)
              .href,
          })),
          ...(cursor === null ? [] : [removed]),
        ],
        nextCursor: cursor === null ? "second-page" : null,
      });
      return;
    }
    if (url.pathname === resolverPath) {
      sendJson(response, 200, {
        url: new URL(
          `/files/${encodeURIComponent(resolvedArtifact.filename)}`,
          origin,
        ).href,
      });
      return;
    }
    if (url.pathname === "/dmm/v1/mods/retired-example") {
      sendJson(response, 200, removed);
      return;
    }
    const listing = listings.find(
      (item) =>
        url.pathname.startsWith(
          `/dmm/v1/mods/${encodeURIComponent(item.id)}/`,
        ) || url.pathname === `/dmm/v1/mods/${encodeURIComponent(item.id)}`,
    );
    if (listing) {
      const path = `/dmm/v1/mods/${encodeURIComponent(listing.id)}`;
      if (url.pathname === path) {
        if (listing === listings[0]) {
          const { release: _release, ...metadata } = listing;
          sendJson(response, 200, {
            ...metadata,
            releaseUrl: new URL(`${path}/current-release`, origin).href,
          });
        } else {
          sendJson(response, 200, listing);
        }
        return;
      }
      if (url.pathname === `${path}/current-release`) {
        sendJson(response, 200, listing.release);
        return;
      }
      if (url.pathname === `${path}/releases`) {
        sendJson(response, 200, {
          items: [listing.release],
          nextCursor: null,
        });
        return;
      }
    }
    const artifact = files.get(url.pathname);
    if (artifact) {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": artifact.size,
      });
      await pipeline(
        createReadStream(resolve(fixtureDirectory, "files", artifact.filename)),
        response,
      );
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  }

  return createServer((request, response) => {
    handle(request, response).catch((error) => {
      if (response.headersSent) response.destroy(error);
      else sendJson(response, 500, { error: "Example fixture unavailable" });
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const fixtureDirectory = resolve(process.argv[2] ?? "examples/mod-source");
  const port = Number(process.env.PORT ?? 8787);
  assert.ok(
    Number.isInteger(port) && port > 0 && port <= 65535,
    "Invalid PORT",
  );
  const publicOrigin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const server = await createExampleServer(fixtureDirectory, publicOrigin);
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`${publicOrigin}/.well-known/dmm-source.json\n`);
  });
}
