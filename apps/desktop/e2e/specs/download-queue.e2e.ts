import { navigate } from "../support/ui";
import { step } from "../support/evidence";
import { fingerprint, observeUntil } from "../support/observations";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { $, browser, expect } from "@wdio/globals";
import path from "node:path";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
  QUEUE_MOD,
  QUEUE_NAME,
  downloadPayload,
} from "../support/download-fixtures";
import { readDownloadState } from "../support/download-oracle";

const NOTICE_DELAY_MS = 8_000;

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
const retry = async (name: string): Promise<void> => {
  const button = await card(name).$("button=Retry");
  await button.waitForClickable();
  await button.click();
};

describe("queued download retry", () => {
  it("shows no health notice for a retry still waiting in the queue", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("downloads");
    await card(DOWNLOAD_NAME).waitForDisplayed();
    await card(QUEUE_NAME).waitForDisplayed();

    // The backend starts this attempt's slow clock when the attempt starts.
    const firstAttempt = Date.now();
    await step("the first attempt fails", async () => {
      await retry(DOWNLOAD_NAME);
      await expect(card(DOWNLOAD_NAME).$("button=Retry")).toBeDisplayed();
      await waitStatus(world, DOWNLOAD_MOD, "failedToDownload");
    });

    await step("a long download holds the queue", async () => {
      await retry(QUEUE_NAME);
      await waitStatus(world, QUEUE_MOD, "downloading");
      await browser.waitUntil(
        async () => /[\d.]+ (KB|MB)\/s/.test(await card(QUEUE_NAME).getText()),
        { timeout: 20_000, timeoutMsg: "The queue blocker never transferred" },
      );
    });

    // Let the failed attempt's clock age past the notice delay.
    const aged = firstAttempt + NOTICE_DELAY_MS + 1_000;
    if (Date.now() < aged) await browser.pause(aged - Date.now());

    await step("the retry waits without a notice", async () => {
      await retry(DOWNLOAD_NAME);
      const queued = Date.now();
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      await browser.pause(2_000);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "queued-retry.png"),
      );
      while (Date.now() < queued + NOTICE_DELAY_MS + 4_000) {
        expect(await notice(DOWNLOAD_NAME).isDisplayed()).toBe(false);
        // The notice only renders while downloading, so a finished retry would hide it.
        expect(await statusOf(world, DOWNLOAD_MOD)).toBe("downloading");
        await browser.pause(250);
      }
      // The blocker is still running, so the retry never left the queue.
      expect(await statusOf(world, QUEUE_MOD)).toBe("downloading");
    });

    await step("the retry runs once the queue frees up", async () => {
      await card(QUEUE_NAME).$("button=Cancel").click();
      await waitStatus(world, QUEUE_MOD, "failedToDownload");
      await waitStatus(world, DOWNLOAD_MOD, "downloaded", 30_000);
    });

    await closeApplication(world, runtime.processId);
    const {
      configuration: { roots },
    } = await assertOwnedWorld(world);
    const mods = path.join(roots.appData, "mods");
    expect(await collectFileInventory(path.join(mods, DOWNLOAD_MOD))).toEqual({
      [DOWNLOAD_FILE]: fingerprint(downloadPayload()),
    });
    expect(await collectFileInventory(path.join(mods, QUEUE_MOD))).toEqual({});
  });
});
