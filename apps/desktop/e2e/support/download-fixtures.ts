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
export const QUEUED_MOD = "local-00000000-0000-4000-8000-000000000005";
export const QUEUED_NAME = "E2E Queued Download";
export const QUEUED_FILE = "queued.vpk";
/** Cases that pause the first download while a second one waits behind it. */
const pausesQueue = (scenario: string) =>
  scenario.startsWith("downloads-pause-queue");
/** Cases whose world holds a second failed mod that can wait in the queue. */
const hasQueuedMod = (scenario: string) =>
  scenario === "downloads-cancel-queued" || pausesQueue(scenario);
export const downloadPayload = (variant = "selected") =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-download.txt",
      contents: `${variant}\n${"fixture-payload\n".repeat(32768)}`,
    },
  ]);
export const QUEUE_MOD = "local-00000000-0000-4000-8000-000000000005";
export const QUEUE_NAME = "E2E Queue Blocker";
const QUEUE_FILE = "blocker.vpk";
// About 200 KB/s for minutes, so this transfer holds the backend's
// one-at-a-time queue while a retried download waits behind it.
const queuePayload = () =>
  Buffer.alloc(40 * 1024 * 1024, "e2e-queue-payload\n");
const queueRoute = (): FixtureRoute => ({
  method: "GET",
  path: `/downloads/${QUEUE_FILE}`,
  status: 200,
  body: queuePayload(),
  range: true,
  headers: { etag: '"e2e-queue-v1"' },
  chunkBytes: 20 * 1024,
  chunkDelayMs: 100,
});
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
    case "downloads-queued-retry":
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
    case "downloads-cancel-connecting":
      // Accepts the request and holds the headers past the downloader's timeouts.
      sequence = [{ ...good, headerDelayMs: 120_000 }, good];
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
  const routes: FixtureRoute[] = [
    { method: "GET", path: `/downloads/${DOWNLOAD_FILE}`, ...good, sequence },
  ];
  if (scenario === "downloads-queued-retry") routes.push(queueRoute());
  // Served so a cancel that fails to drop the queued mod shows as a download.
  if (scenario === "downloads-cancel-queued")
    routes.push({ method: "GET", path: `/downloads/${QUEUED_FILE}`, ...good });
  if (pausesQueue(scenario)) {
    // About 24 s, so it is still running when the paused one is resumed.
    const queued = { ...good, chunkBytes: 32768, chunkDelayMs: 1500 };
    routes.push({
      method: "GET",
      path: `/downloads/${QUEUED_FILE}`,
      ...good,
      sequence:
        scenario === "downloads-pause-queue-cancel" ? [good] : [queued, good],
    });
  }
  return routes;
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
  const mods = [mod];
  if (scenario === "downloads-queued-retry") {
    const blocker = queuePayload();
    const file: ModDownloadItem = {
      ...selected,
      name: QUEUE_FILE,
      url: `${origin}/downloads/${QUEUE_FILE}`,
      size: blocker.length,
      md5Checksum: createHash("md5").update(blocker).digest("hex"),
      description: "Queue blocker",
    };
    mods.push({
      ...fixtureMod(QUEUE_MOD, 1),
      name: QUEUE_NAME,
      status: ModStatus.FailedToDownload,
      installedVpks: [],
      downloads: [file],
      selectedDownloads: [file],
    });
  }
  if (hasQueuedMod(scenario)) {
    const queued: ModDownloadItem = {
      ...selected,
      name: QUEUED_FILE,
      url: `${origin}/downloads/${QUEUED_FILE}`,
    };
    mods.push({
      ...fixtureMod(QUEUED_MOD, 1),
      name: QUEUED_NAME,
      status: ModStatus.FailedToDownload,
      installedVpks: [],
      downloads: [queued],
      selectedDownloads: [queued],
    });
  }
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
    mods,
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
          localMods: mods,
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
  if (scenario === "downloads-queued-retry") {
    const statuses = (file: string) =>
      requests
        .filter((request) => request.url === `/downloads/${file}`)
        .map((request) => request.responseStatus);
    assert.deepEqual(statuses(DOWNLOAD_FILE), [401, 200]);
    assert.deepEqual(statuses(QUEUE_FILE), [200]);
    return;
  }
  if (pausesQueue(scenario)) {
    const sent = (file: string) =>
      requests.filter((request) => request.url === `/downloads/${file}`);
    const [first, ...again] = sent(DOWNLOAD_FILE);
    assert.equal(first.headers.range, undefined);
    if (scenario === "downloads-pause-queue") {
      // Resume continues from the partial file the pause kept.
      assert.equal(again.length, 1);
      assert.match(String(again[0].headers.range), /^bytes=[1-9]\d*-$/);
      assert.equal(again[0].responseStatus, 206);
    } else {
      // Cancelled, or failed by a restart or reload: a UI retry starts over.
      assert.equal(
        again.length,
        scenario === "downloads-pause-queue-cancel" ? 0 : 1,
      );
      assert.ok(again.every((request) => request.headers.range === undefined));
    }
    const queued = sent(QUEUED_FILE);
    const retried = [
      "downloads-pause-queue-reload",
      "downloads-pause-queue-restart",
    ];
    assert.equal(queued.length, retried.includes(scenario) ? 2 : 1);
    assert.ok(queued.every((request) => request.headers.range === undefined));
    return;
  }
  assert.ok(
    requests.every((request) => request.url === `/downloads/${DOWNLOAD_FILE}`),
  );
  if (scenario === "downloads-range") {
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.range, undefined);
    assert.equal(requests[1].headers.range, "bytes=65536-");
    assert.equal(requests[1].responseStatus, 206);
  } else if (scenario === "downloads-pause") {
    // A pause ends the request; Resume continues from the partial file.
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.range, undefined);
    assert.match(String(requests[1].headers.range), /^bytes=[1-9]\d*-$/);
    assert.equal(requests[1].responseStatus, 206);
  } else {
    const retry = [
      "downloads-auth",
      "downloads-corrupt",
      "downloads-variants",
      "downloads-cancel",
      "downloads-cancel-connecting",
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
    if (scenario === "downloads-cancel-connecting")
      assert.equal(
        requests[0].closedBeforeHeaders,
        true,
        "The cancelled request must close before its headers arrive",
      );
    assert.equal(requests.at(-1)?.responseStatus, 200);
  }
};
