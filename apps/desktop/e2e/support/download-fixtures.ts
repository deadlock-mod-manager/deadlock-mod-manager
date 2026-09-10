import { readPersistedDocument } from "./observations";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ModStatus, type ModDownloadItem } from "../../src/types/mods";
import { fixtureMod } from "./mod-fixtures";
import type {
  FixtureRequest,
  FixtureResponse,
  FixtureRoute,
} from "./fixture-server";
import { collectFileInventory, type CreatedWorld } from "./world";
import { buildSyntheticVpk } from "./vpk";

export const DOWNLOAD_MOD = "local-00000000-0000-4000-8000-000000000004";
export const DOWNLOAD_NAME = "E2E Download";
export const DOWNLOAD_FILE = "selected.vpk";
export const downloadPayload = (variant = "selected") =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-download.txt",
      contents: `${variant}\n${"fixture-payload\n".repeat(32768)}`,
    },
  ]);
export const downloadRoutes = (scenario: string): FixtureRoute[] => {
  const body = downloadPayload();
  const good = {
    status: 200,
    body,
    range: true,
    headers: { etag: '"e2e-download-v1"' },
  };
  const slow = { ...good, chunkBytes: 32768, chunkDelayMs: 500 };
  const corrupt = Buffer.from(body);
  corrupt[corrupt.length - 1] ^= 0xff;
  let sequence: FixtureResponse[];
  switch (scenario) {
    case "downloads-auth":
    case "downloads-variants":
      sequence = [{ status: 401, body: "Authentication required" }, good];
      break;
    case "downloads-redirect":
      sequence = [
        {
          status: 302,
          body: "",
          headers: { location: "https://gamebanana.com/e2e-must-not-connect" },
        },
        good,
      ];
      break;
    case "downloads-corrupt":
      sequence = [{ ...good, body: corrupt }, good];
      break;
    case "downloads-range":
      sequence = [
        {
          ...good,
          disconnectAfterBytes: 65536,
          chunkBytes: 32768,
          chunkDelayMs: 150,
        },
        good,
      ];
      break;
    default:
      sequence = [slow];
  }
  return [
    { method: "GET", path: `/downloads/${DOWNLOAD_FILE}`, ...good, sequence },
  ];
};

export const prepareDownloadWorld = async (
  world: CreatedWorld,
  origin: string,
  scenario: string,
): Promise<void> => {
  const payload = downloadPayload();
  const selected: ModDownloadItem = {
    name: DOWNLOAD_FILE,
    url: `${origin}/downloads/${DOWNLOAD_FILE}`,
    size: payload.length,
    md5Checksum: createHash("md5").update(payload).digest("hex"),
    createdAt: new Date(0),
    updatedAt: null,
    description: "Selected E2E variant",
  };
  const downloads =
    scenario === "downloads-variants"
      ? [
          {
            ...selected,
            name: "unselected.vpk",
            url: `${origin}/downloads/unselected.vpk`,
          },
          selected,
        ]
      : [selected];
  const mod = {
    ...fixtureMod(DOWNLOAD_MOD, 0),
    name: DOWNLOAD_NAME,
    status: ModStatus.FailedToDownload,
    installedVpks: [],
    downloads,
    selectedDownloads: [selected],
  };
  const storePath = path.join(world.configuration.roots.appData, "state.json");
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const profile = {
    id: "default",
    name: "Default Profile",
    folderName: null,
    isDefault: true,
    createdAt: new Date(0),
    mods: [mod],
    enabledMods: {},
  };
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          activeProfileId: "default",
          localMods: [mod],
          profiles: { default: profile },
        },
      }),
    }),
  );
  await writeFile(
    path.join(world.configuration.roots.game, "protected.txt"),
    "Protected download world\n",
  );
  await writeFile(
    path.join(world.artifactsDirectory, "downloads-initial.json"),
    JSON.stringify({
      steam: await collectFileInventory(world.configuration.roots.steam),
    }),
  );
};

export const assertDownloadNetwork = (
  scenario: string,
  journal: readonly FixtureRequest[],
): void => {
  const requests = journal.filter((request) =>
    request.url.startsWith("/downloads/"),
  );
  assert.ok(requests.length > 0, "Download must reach the real HTTP fixture");
  assert.ok(
    requests.every((request) => request.url === `/downloads/${DOWNLOAD_FILE}`),
  );
  if (scenario === "downloads-range") {
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.range, undefined);
    assert.equal(requests[1].headers.range, "bytes=65536-");
    assert.equal(requests[1].responseStatus, 206);
  } else {
    const retry = [
      "downloads-auth",
      "downloads-corrupt",
      "downloads-variants",
      "downloads-cancel",
      "downloads-restart",
      "downloads-redirect",
    ].includes(scenario);
    assert.equal(requests.length, retry ? 2 : 1);
    assert.ok(
      requests.every((request) => request.headers.range === undefined),
      "UI retry must purge stale partial state",
    );
    if (scenario === "downloads-auth" || scenario === "downloads-variants")
      assert.equal(requests[0].responseStatus, 401);
    if (scenario === "downloads-redirect")
      assert.equal(requests[0].responseStatus, 302);
    assert.equal(requests.at(-1)?.responseStatus, 200);
  }
};
