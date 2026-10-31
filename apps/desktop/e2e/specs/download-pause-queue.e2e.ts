import { navigate } from "../support/ui";
import { step } from "../support/evidence";
import { fingerprint, observeUntil } from "../support/observations";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { $, browser, expect } from "@wdio/globals";
import { readFile, stat, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
  QUEUED_FILE,
  QUEUED_MOD,
  QUEUED_NAME,
  downloadPayload,
} from "../support/download-fixtures";
import { readDownloadState } from "../support/download-oracle";

const NOTICE_DELAY_MS = 8_000;
/** Ample for a purge and a queue IPC; the first download runs for about 8 s. */
const QUEUE_SETTLE_MS = 1_000;

const card = (name: string) => $(`[role="button"][aria-label="Open ${name}"]`);
const notice = (name: string) => card(name).$('[role="status"]');
const statusOf = async (world: string, modId: string) =>
  (await readDownloadState(world)).find((mod) => mod.remoteId === modId)
    ?.status;
const waitStatus = async (
  world: string,
  modId: string,
  status: string,
  timeout = 20_000,
): Promise<void> => {
  await observeUntil(
    `${modId} did not reach ${status}`,
    () => readDownloadState(world),
    (mods) => mods.find((mod) => mod.remoteId === modId)?.status === status,
    timeout,
  );
};
const click = async (name: string, label: string): Promise<void> => {
  const button = await card(name).$(`button=${label}`);
  await button.waitForClickable();
  await button.click();
};
const requestsFor = async (world: string, file: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const origin = configuration.endpoints[0].origin;
  return z
    .object({
      requests: z.array(
        z.object({
          url: z.string(),
          headers: z.object({ range: z.string().optional() }),
        }),
      ),
    })
    .parse(await (await fetch(`${origin}/__control/requests`)).json())
    .requests.filter(({ url }) => url === `/downloads/${file}`);
};
const modDirectory = async (world: string, modId: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  return path.join(roots.appData, "mods", modId);
};
const partialSize = async (world: string) =>
  (
    await stat(
      path.join(
        await modDirectory(world, DOWNLOAD_MOD),
        `${DOWNLOAD_FILE}.partial`,
      ),
    ).catch(() => ({ size: 0 }))
  ).size;
const screenshot = (world: string, name: string) =>
  browser.saveScreenshot(path.join(world, "artifacts", `${name}.png`));
const isTransferring = async (name: string) =>
  /[\d.]+ (KB|MB)\/s/.test(await card(name).getText());

/** Pauses the first download while the second waits behind it; returns the bytes kept. */
const pauseWithSecondQueued = async (
  world: string,
  scenario: string,
): Promise<number> => {
  let kept = 0;
  await step("pause the first download while a second one waits", async () => {
    await click(DOWNLOAD_NAME, "Retry");
    await waitStatus(world, DOWNLOAD_MOD, "downloading");
    await browser.waitUntil(async () => (await partialSize(world)) > 0, {
      timeoutMsg: "The first download never wrote its partial file",
    });
    await click(QUEUED_NAME, "Retry");
    await waitStatus(world, QUEUED_MOD, "downloading");
    // Retry purges the mod before it queues it, and neither step shows in the UI.
    await setTimeout(QUEUE_SETTLE_MS);
    expect(await requestsFor(world, QUEUED_FILE)).toEqual([]);

    await click(DOWNLOAD_NAME, "Pause");
    await waitStatus(world, DOWNLOAD_MOD, "paused");
    let stableSince = Date.now();
    await browser.waitUntil(
      async () => {
        const size = await partialSize(world);
        if (size !== kept) {
          kept = size;
          stableSince = Date.now();
        }
        return Date.now() - stableSince >= 800;
      },
      {
        timeout: 5000,
        interval: 100,
        timeoutMsg: "Paused download kept writing bytes",
      },
    );
    await expect(card(DOWNLOAD_NAME).$("button=Resume")).toBeDisplayed();
  });
  await step(
    "the queued download starts while the first is paused",
    async () => {
      try {
        await observeUntil(
          "The queued download stayed behind the paused one",
          () => requestsFor(world, QUEUED_FILE),
          (requests) => requests.length === 1,
          5_000,
        );
        // The cancel case serves the second download at full speed.
        if (scenario !== "downloads-pause-queue-cancel")
          await browser.waitUntil(() => isTransferring(QUEUED_NAME), {
            timeout: 10_000,
            timeoutMsg: "The queued download never transferred",
          });
      } finally {
        await screenshot(world, "paused-next");
      }
      expect(await statusOf(world, DOWNLOAD_MOD)).toBe("paused");
    },
  );
  return kept;
};

const resumeBehindRunning = async (world: string, kept: number) => {
  await step(
    "resume waits for the running download, without a notice",
    async () => {
      await click(DOWNLOAD_NAME, "Resume");
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      const resumed = Date.now();
      await setTimeout(2_000);
      await screenshot(world, "resumed-waiting");
      while (Date.now() < resumed + NOTICE_DELAY_MS + 2_000) {
        expect(await notice(DOWNLOAD_NAME).isDisplayed()).toBe(false);
        // Resuming doesn't take the worker from the download running now.
        expect(await requestsFor(world, DOWNLOAD_FILE)).toHaveLength(1);
        expect(await statusOf(world, QUEUED_MOD)).toBe("downloading");
        await setTimeout(250);
      }
    },
  );
  await step(
    "the first continues from its partial once the second finishes",
    async () => {
      await waitStatus(world, QUEUED_MOD, "downloaded", 40_000);
      await waitStatus(world, DOWNLOAD_MOD, "downloaded", 30_000);
      const [, continued] = await requestsFor(world, DOWNLOAD_FILE);
      expect(continued?.headers.range).toBe(`bytes=${kept}-`);
    },
  );
};

const cancelPaused = async (world: string) => {
  await step("cancel the paused download", async () => {
    await waitStatus(world, QUEUED_MOD, "downloaded");
    await click(DOWNLOAD_NAME, "Cancel");
    await expect(card(DOWNLOAD_NAME).$("button=Retry")).toBeDisplayed();
    await waitStatus(world, DOWNLOAD_MOD, "failedToDownload");
    await observeUntil(
      "The cancelled download left its partial files",
      async () => collectFileInventory(await modDirectory(world, DOWNLOAD_MOD)),
      (files) => Object.keys(files).length === 0,
    );
    await screenshot(world, "cancelled-paused");
    expect(await requestsFor(world, DOWNLOAD_FILE)).toHaveLength(1);
  });
};

const reloadWhilePaused = async (world: string) => {
  await step(
    "reload while the first is paused and the second runs",
    async () => {
      await browser.refresh();
      await navigate("downloads");
      await expect(card(DOWNLOAD_NAME).$("button=Retry")).toBeDisplayed();
      await expect(card(QUEUED_NAME).$("button=Retry")).toBeDisplayed();
      await observeUntil(
        "The backend kept downloads the reloaded window no longer tracks",
        async () =>
          z
            .array(z.object({ modId: z.string() }))
            .parse(
              await browser.execute(() =>
                window["__TAURI_INTERNALS__"].invoke("get_all_downloads"),
              ),
            ),
        (downloads) => downloads.length === 0,
      );
      await observeUntil(
        "The paused download's partial files outlived the reload",
        async () =>
          collectFileInventory(await modDirectory(world, DOWNLOAD_MOD)),
        (files) => Object.keys(files).length === 0,
      );
      await screenshot(world, "reloaded-paused");
    },
  );
  await step("both stay stopped until retried", async () => {
    await setTimeout(QUEUE_SETTLE_MS);
    expect(await requestsFor(world, DOWNLOAD_FILE)).toHaveLength(1);
    expect(await requestsFor(world, QUEUED_FILE)).toHaveLength(1);
    await click(DOWNLOAD_NAME, "Retry");
    await click(QUEUED_NAME, "Retry");
    await waitStatus(world, DOWNLOAD_MOD, "downloaded", 30_000);
    await waitStatus(world, QUEUED_MOD, "downloaded", 30_000);
  });
};

const assertFiles = async (world: string, cancelled: boolean) => {
  const payload = { [DOWNLOAD_FILE]: fingerprint(downloadPayload()) };
  expect(
    await collectFileInventory(await modDirectory(world, DOWNLOAD_MOD)),
  ).toEqual(cancelled ? {} : payload);
  if (cancelled) return;
  expect(
    await collectFileInventory(await modDirectory(world, QUEUED_MOD)),
  ).toEqual({ [QUEUED_FILE]: fingerprint(downloadPayload()) });
};

describe("pausing a download frees the queue", () => {
  it("starts the next download while one is paused", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const scenario = process.env.DMM_E2E_CASE_ID ?? "";
    const checkpointPath = path.join(
      world,
      "artifacts",
      "pause-checkpoint.json",
    );
    await navigate("downloads");
    await card(DOWNLOAD_NAME).waitForDisplayed();
    await card(QUEUED_NAME).waitForDisplayed();

    if (process.env.DMM_E2E_PHASE === "pause") {
      const kept = await pauseWithSecondQueued(world, scenario);
      if (scenario === "downloads-pause-queue")
        await resumeBehindRunning(world, kept);
      else if (scenario === "downloads-pause-queue-cancel")
        await cancelPaused(world);
      else if (scenario === "downloads-pause-queue-reload")
        await reloadWhilePaused(world);
      else if (scenario === "downloads-pause-queue-restart") {
        // The restart interrupts the app with the first paused and the second running.
        await writeFile(
          checkpointPath,
          JSON.stringify({ processId: runtime.processId }),
        );
        return;
      } else throw new Error(`Unknown pause case ${scenario}`);
    } else if (process.env.DMM_E2E_PHASE === "restart-pause") {
      const checkpoint = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpointPath, "utf8")));
      expect(runtime.processId).not.toBe(checkpoint.processId);
      await step(
        "both downloads come back failed, as a paused one does",
        async () => {
          await waitStatus(world, DOWNLOAD_MOD, "failedToDownload");
          await waitStatus(world, QUEUED_MOD, "failedToDownload");
          await expect(card(DOWNLOAD_NAME).$("button=Retry")).toBeDisplayed();
          await expect(card(QUEUED_NAME).$("button=Retry")).toBeDisplayed();
          expect(
            Object.keys(
              await collectFileInventory(
                await modDirectory(world, DOWNLOAD_MOD),
              ),
            ).sort(),
          ).toEqual([
            `${DOWNLOAD_FILE}.partial`,
            `${DOWNLOAD_FILE}.partial.meta`,
          ]);
          await screenshot(world, "restarted-paused");
        },
      );
      await step("both retries complete", async () => {
        await click(DOWNLOAD_NAME, "Retry");
        await click(QUEUED_NAME, "Retry");
        await waitStatus(world, DOWNLOAD_MOD, "downloaded", 30_000);
        await waitStatus(world, QUEUED_MOD, "downloaded", 30_000);
      });
    } else throw new Error("Unknown pause phase");

    await closeApplication(world, runtime.processId);
    await assertFiles(world, scenario === "downloads-pause-queue-cancel");
  });
});
