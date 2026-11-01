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
/** Cases whose second mod waits behind a running download and never starts. */
export const queuesBehindRunning = (scenario: string) =>
  scenario === "downloads-cancel-queued" ||
  scenario === "downloads-reload-queued" ||
  scenario === "downloads-delete-queued";
/** Cases whose world holds a second failed mod that can wait in the queue. */
const hasQueuedMod = (scenario: string) =>
  queuesBehindRunning(scenario) || pausesQueue(scenario);
export const downloadPayload = (variant = "selected") =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-download.txt",
      contents: `${variant}\n${"fixture-payload\n".repeat(32768)}`,
    },
  ]);

/** Cases that run with "Faster downloads"; `-off` is the same transfer without it. */
export const isSegmentedCase = (scenario: string): boolean =>
  scenario.startsWith("downloads-segmented");
const segmentedEnabled = (scenario: string): boolean =>
  isSegmentedCase(scenario) && scenario !== "downloads-segmented-off";
/** Three files of one mod, to watch the connection budget. */
const BUDGET_FILES = [DOWNLOAD_FILE, "second.vpk", "third.vpk"];
export const downloadFiles = (scenario: string): string[] =>
  scenario === "downloads-segmented-budget" ? BUDGET_FILES : [DOWNLOAD_FILE];
// Past the downloader's 8 MiB threshold, with no repeating pattern, so bytes
// from the wrong offset never match by accident.
let segmentedPayloadCache: Buffer | undefined;
const segmentedPayload = (): Buffer => {
  if (segmentedPayloadCache) return segmentedPayloadCache;
  const noise = Buffer.alloc(16 * 1024 * 1024);
  let state = 0x2545f491;
  for (let index = 0; index < noise.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    noise[index] = state & 0xff;
  }
  segmentedPayloadCache = buildSyntheticVpk([
    { path: "scripts/e2e-segmented.bin", contents: noise },
  ]);
  return segmentedPayloadCache;
};
export const payloadFor = (scenario: string): Buffer =>
  isSegmentedCase(scenario) ? segmentedPayload() : downloadPayload();
// Every response gets 64 KiB per 40 ms (1.6 MB/s), like a server limiting each
// connection, so one stream can't beat this floor and four can.
const SEGMENTED_CHUNK = 64 * 1024;
const SEGMENTED_DELAY_MS = 40;
const singleStreamFloorMs = (size: number): number =>
  (Math.ceil(size / SEGMENTED_CHUNK) - 1) * SEGMENTED_DELAY_MS;
/** The downloader's four spans, as `bytes=a-b` headers. */
export const segmentRanges = (size: number): string[] =>
  [0, 1, 2, 3].map(
    (index) =>
      `bytes=${Math.floor((index * size) / 4)}-${Math.floor(((index + 1) * size) / 4) - 1}`,
  );
const segmentStart = (size: number, index: number): number =>
  Math.floor((index * size) / 4);
const segmentedRoutes = (scenario: string): FixtureRoute[] => {
  const body = segmentedPayload();
  const good = {
    status: 200,
    body,
    range: true,
    headers: { etag: '"e2e-segmented-v1"' },
    chunkBytes: SEGMENTED_CHUNK,
    chunkDelayMs: SEGMENTED_DELAY_MS,
  };
  const third = segmentStart(body.length, 2);
  let sequence: FixtureResponse[];
  switch (scenario) {
    case "downloads-segmented-no-range":
      sequence = [{ ...good, range: false }];
      break;
    case "downloads-segmented-range-error":
      // Fails the first segment's request but serves an ordinary one.
      sequence = [{ status: 400, body: "Bad Request" }, good];
      break;
    case "downloads-segmented-wrong-range":
      // The third segment comes back one byte later than it says it starts.
      sequence = [{ ...good, rangeFrom: { at: third, serveFrom: third + 1 } }];
      break;
    case "downloads-segmented-corrupt": {
      const corrupt = Buffer.from(body);
      corrupt[third + 10] ^= 0xff;
      sequence = [{ ...good, body: corrupt, repeat: 4 }, good];
      break;
    }
    case "downloads-segmented-pause":
    case "downloads-segmented-cancel":
    case "downloads-segmented-restart":
      // About 8 s for the file: time to pause, cancel or stop the app mid-transfer.
      sequence = [{ ...good, chunkDelayMs: 120 }];
      break;
    default:
      sequence = [good];
  }
  const routes: FixtureRoute[] = [];
  for (const file of downloadFiles(scenario))
    routes.push({
      method: "GET",
      path: `/downloads/${file}`,
      ...good,
      sequence,
    });
  return routes;
};
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
/** Cases whose world holds a second mod that blocks the queue. */
const hasQueueBlocker = (scenario: string) =>
  scenario === "downloads-queued-retry" ||
  scenario === "downloads-queued-waiting";
export const downloadRoutes = (scenario: string): FixtureRoute[] => {
  if (isSegmentedCase(scenario)) return segmentedRoutes(scenario);
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
    case "downloads-queued-waiting":
      // About 24 s, so it is still running when it is paused; the resume is quick.
      sequence = [{ ...good, chunkBytes: 32768, chunkDelayMs: 1500 }, good];
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
    case "downloads-wrong-range":
      // The resume comes back from byte 0 while claiming to be the resume.
      sequence = [
        {
          ...good,
          disconnectAfterBytes: 65536,
          chunkBytes: 32768,
          chunkDelayMs: 150,
        },
        // Wherever the client resumes: what reached it before the cut varies.
        { ...good, rangeFrom: { serveFrom: 0 } },
      ];
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
    case "downloads-delete-queued":
      sequence = [{ ...slow, chunkDelayMs: 1_000 }];
      break;
    default:
      sequence = [slow];
  }
  const routes: FixtureRoute[] = [
    { method: "GET", path: `/downloads/${DOWNLOAD_FILE}`, ...good, sequence },
  ];
  if (hasQueueBlocker(scenario)) routes.push(queueRoute());
  // Served so a cancel that fails to drop the queued mod shows as a download.
  if (queuesBehindRunning(scenario))
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
  const payload = payloadFor(scenario);
  const missingActiveProfile =
    scenario === "downloads-deleted-profile" ||
    scenario === "downloads-deleted-default";
  const selected: ModDownloadItem = {
    name: DOWNLOAD_FILE,
    url: `${origin}/downloads/${DOWNLOAD_FILE}`,
    size: payload.length,
    md5Checksum: createHash("md5").update(payload).digest("hex"),
    createdAt: new Date(0),
    updatedAt: null,
    description: "Selected E2E variant",
  };
  const files: ModDownloadItem[] = [];
  for (const name of downloadFiles(scenario))
    files.push({ ...selected, name, url: `${origin}/downloads/${name}` });
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
      : files;
  const mod = {
    ...fixtureMod(DOWNLOAD_MOD, 0),
    name: DOWNLOAD_NAME,
    status: missingActiveProfile
      ? ModStatus.Downloading
      : ModStatus.FailedToDownload,
    installedVpks: [],
    downloads,
    selectedDownloads: files,
  };
  const mods = [mod];
  if (hasQueueBlocker(scenario)) {
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
  const otherProfile = {
    ...profile,
    id: "other",
    name: "Other Profile",
    folderName: "other",
    isDefault: false,
    mods: [],
  };
  const profiles: Record<string, typeof profile | typeof otherProfile> = {};
  if (scenario !== "downloads-deleted-default") {
    profiles.default = { ...profile, mods: missingActiveProfile ? [] : mods };
  }
  const modProgress: Record<string, { percentage: number }> = {};
  if (missingActiveProfile) {
    profiles.other = otherProfile;
    modProgress[DOWNLOAD_MOD] = { percentage: 100 };
  }
  const state = {
    ...persisted.state,
    // `downloads-segmented` turns it on through Settings instead.
    segmentedDownloads:
      segmentedEnabled(scenario) && scenario !== "downloads-segmented",
    activeProfileId: missingActiveProfile ? "profile_deleted" : "default",
    localMods: mods,
    profiles,
    modProgress,
  };
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({ ...persisted, state }),
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

const millis = (stamp: string | undefined): number => {
  assert.ok(stamp, "A download request never finished");
  return Date.parse(stamp);
};

/** Most download responses being sent at the same moment. */
const peakConcurrency = (requests: readonly FixtureRequest[]): number =>
  Math.max(
    0,
    ...requests.map(
      (request) =>
        requests.filter(
          (other) =>
            millis(other.at) <= millis(request.at) &&
            millis(request.at) < millis(other.endedAt),
        ).length,
    ),
  );

const transferMs = (requests: readonly FixtureRequest[]): number =>
  Math.max(...requests.map((request) => millis(request.endedAt))) -
  Math.min(...requests.map((request) => millis(request.at)));

const rangesOf = (list: readonly FixtureRequest[]): string[] =>
  list.map((request) => String(request.headers.range)).sort();

const allPartial = (list: readonly FixtureRequest[]): void =>
  assert.ok(
    list.every((request) => request.responseStatus === 206),
    "Every segment must be answered with 206",
  );

const assertSegmentedNetwork = (
  scenario: string,
  requests: readonly FixtureRequest[],
): void => {
  const size = segmentedPayload().length;
  const planned = segmentRanges(size);
  const ranged = requests.filter((request) => request.headers.range);
  const whole = requests.filter((request) => !request.headers.range);
  const plannedTimes = (times: number) =>
    Array.from({ length: times }, () => planned)
      .flat()
      .sort();
  switch (scenario) {
    case "downloads-segmented-off":
      assert.equal(ranged.length, 0);
      assert.equal(whole.length, 1);
      assert.equal(whole[0].responseStatus, 200);
      assert.ok(transferMs(whole) >= singleStreamFloorMs(size));
      return;
    case "downloads-segmented": {
      assert.equal(whole.length, 0, "No request may fetch the whole file");
      assert.deepEqual(rangesOf(ranged), plannedTimes(1));
      allPartial(ranged);
      assert.equal(
        peakConcurrency(ranged),
        4,
        "The four segments must overlap",
      );
      assert.equal(
        new Set(ranged.map((request) => request.remotePort)).size,
        4,
        "Each segment needs its own connection",
      );
      const elapsed = transferMs(ranged);
      const floor = singleStreamFloorMs(size);
      assert.ok(
        elapsed < floor * 0.6,
        `Segmented transfer took ${elapsed} ms; one connection needs at least ${floor} ms`,
      );
      return;
    }
    case "downloads-segmented-no-range":
    case "downloads-segmented-range-error":
      assert.deepEqual(
        requests.map((request) => [
          request.headers.range,
          request.responseStatus,
        ]),
        [
          [planned[0], scenario === "downloads-segmented-no-range" ? 200 : 400],
          [undefined, 200],
        ],
        "A server ignoring or failing Range must get one ordinary request",
      );
      return;
    case "downloads-segmented-wrong-range": {
      // The misanswered third segment stops the others, so one that hadn't
      // sent its request yet never does.
      const sent = rangesOf(ranged);
      assert.ok(
        sent.every((range) => planned.includes(range)),
        `${sent.join(", ")} are not the planned spans`,
      );
      assert.equal(new Set(sent).size, sent.length, "A span was asked twice");
      assert.ok(sent.includes(planned[0]) && sent.includes(planned[2]));
      allPartial(ranged);
      assert.equal(whole.length, 1);
      assert.equal(requests.at(-1)?.headers.range, undefined);
      assert.equal(requests.at(-1)?.responseStatus, 200);
      return;
    }
    case "downloads-segmented-budget":
      assert.equal(whole.length, 0);
      assert.equal(ranged.length, BUDGET_FILES.length * 4);
      allPartial(ranged);
      assert.equal(
        peakConcurrency(ranged),
        4,
        "Three segmented files on one server may only use four connections",
      );
      return;
    case "downloads-segmented-pause": {
      assert.equal(whole.length, 0);
      assert.deepEqual(rangesOf(ranged.slice(0, 4)), plannedTimes(1));
      const resumed = new Map(
        ranged.slice(4).map((request) => {
          const range = String(request.headers.range);
          assert.match(range, /^bytes=\d+-\d+$/);
          const [start, end] = range.slice(6).split("-").map(Number);
          return [end, start];
        }),
      );
      assert.equal(ranged.length, 8);
      assert.equal(resumed.size, 4);
      let reusedPrefix = false;
      for (const range of planned) {
        const [start, end] = range.slice(6).split("-").map(Number);
        const offset = resumed.get(end);
        assert.ok(offset !== undefined && offset >= start && offset <= end);
        reusedPrefix ||= offset > start;
      }
      assert.ok(reusedPrefix, "Resume must reuse partial segment bytes");
      allPartial(ranged);
      return;
    }
    default: {
      assert.equal(whole.length, 0);
      assert.deepEqual(rangesOf(ranged), plannedTimes(2));
      allPartial(ranged);
    }
  }
};

export const assertDownloadNetwork = (
  scenario: string,
  journal: readonly FixtureRequest[],
): void => {
  const requests = journal.filter((request) =>
    request.url.startsWith("/downloads/"),
  );
  assert.ok(requests.length > 0, "Download must reach the real HTTP fixture");
  if (isSegmentedCase(scenario)) {
    assertSegmentedNetwork(scenario, requests);
    return;
  }
  if (scenario === "downloads-wrong-range") {
    const resume = String(requests[1]?.headers.range);
    assert.match(resume, /^bytes=[1-9]\d*-$/, "The cut connection must resume");
    assert.deepEqual(
      requests.map((request) => [
        request.headers.range,
        request.responseStatus,
      ]),
      [
        [undefined, 200],
        [resume, 206],
        [undefined, 200],
      ],
      "A resume answered from the wrong offset must restart from scratch",
    );
    return;
  }
  if (hasQueueBlocker(scenario)) {
    const statuses = (file: string) =>
      requests
        .filter((request) => request.url === `/downloads/${file}`)
        .map((request) => request.responseStatus);
    if (scenario === "downloads-queued-retry") {
      assert.deepEqual(statuses(DOWNLOAD_FILE), [401, 200]);
      assert.deepEqual(statuses(QUEUE_FILE), [200]);
      return;
    }
    // Nothing is requested while it waits, paused or not; paused after it
    // started, it continues with a Range request. The blocker runs twice.
    assert.deepEqual(statuses(DOWNLOAD_FILE), [200, 206]);
    assert.deepEqual(statuses(QUEUE_FILE), [200, 200]);
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
      "downloads-reload-queued",
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
