import { navigate } from "../support/ui";
import { step } from "../support/evidence";
import { observeUntil } from "../support/observations";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { $, browser, expect } from "@wdio/globals";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
  QUEUED_FILE,
  QUEUED_NAME,
} from "../support/download-fixtures";
import {
  assertDownloadDisk,
  downloadDirectory,
  readDownloadState,
} from "../support/download-oracle";

const card = (name = DOWNLOAD_NAME) =>
  $(`[role="button"][aria-label="Open ${name}"]`);
const waitStatus = async (world: string, status: string): Promise<void> => {
  await observeUntil(
    `Download did not reach ${status}`,
    () => readDownloadState(world),
    (mods) => mods[0]?.status === status,
    20_000,
  );
};
const retry = async (name?: string): Promise<void> => {
  const button = await card(name).$("button=Retry");
  await button.waitForClickable();
  await button.click();
};
const toast = (title: string) =>
  $(
    `//*[@data-sonner-toast]//*[@data-title and starts-with(normalize-space(), "${title}")]`,
  );
const pause = async (world: string): Promise<void> => {
  await waitStatus(world, "downloading");
  const partial = path.join(
    await downloadDirectory(world),
    `${DOWNLOAD_FILE}.partial`,
  );
  await browser.waitUntil(
    async () => (await stat(partial).catch(() => ({ size: 0 }))).size > 0,
  );
  const button = await card().$("button=Pause");
  await button.waitForClickable();
  await button.click();
  await waitStatus(world, "paused");
  let previousSize = -1;
  let stableSince = Date.now();
  await browser.waitUntil(
    async () => {
      const size = (await stat(partial)).size;
      if (size !== previousSize) {
        previousSize = size;
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
  await expect(card().$("button=Resume")).toBeDisplayed();
  await assertDownloadDisk(world, "paused", "paused");
};
const downloadRequests = async (world: string, file = DOWNLOAD_FILE) => {
  const { configuration } = await assertOwnedWorld(world);
  const origin = configuration.endpoints[0].origin;
  return z
    .object({ requests: z.array(z.object({ url: z.string() })) })
    .parse(await (await fetch(`${origin}/__control/requests`)).json())
    .requests.filter(({ url }) => url === `/downloads/${file}`);
};
const cancelQueued = async (world: string): Promise<void> => {
  // The downloader handles one mod at a time, so the second waits in its queue.
  await step("queue a second download behind the first", async () => {
    await observeUntil(
      "Download request did not reach the server",
      () => downloadRequests(world),
      (requests) => requests.length === 1,
    );
    await retry(QUEUED_NAME);
  });
  await step("cancel the queued download", async () => {
    const button = await card(QUEUED_NAME).$("button=Cancel");
    await button.waitForClickable();
    await button.click();
    await expect(card(QUEUED_NAME).$("button=Retry")).toBeDisplayed();
    await browser.saveScreenshot(
      path.join(world, "artifacts", "cancelled-queued-download.png"),
    );
  });
  await step("the first download finishes alone", async () => {
    await waitStatus(world, "downloaded");
    expect(await downloadRequests(world, QUEUED_FILE)).toEqual([]);
  });
};
const cancelWhileConnecting = async (world: string): Promise<void> => {
  await step("cancel while the server withholds headers", async () => {
    await observeUntil(
      "Download request did not reach the server",
      () => downloadRequests(world),
      (requests) => requests.length === 1,
    );
    const button = await card().$("button=Cancel");
    await button.waitForClickable();
    await button.click();
    await waitStatus(world, "failedToDownload");
    await expect(card().$("button=Retry")).toBeDisplayed();
    await assertDownloadDisk(world, "cancelled", "failedToDownload");
  });
  // The downloader handles one mod at a time, so a cancelled request that is
  // still waiting holds back the retry.
  await step("retry reaches the server", async () => {
    await retry();
    await observeUntil(
      "Retry stayed queued behind the cancelled request",
      () => downloadRequests(world),
      (requests) => requests.length === 2,
      10_000,
    );
  });
  await waitStatus(world, "downloaded");
};

describe("real Rust downloads", () => {
  it("keeps UI, partial files and selected payload consistent across failure and restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const scenario = process.env.DMM_E2E_CASE_ID;
    const checkpointPath = path.join(
      world,
      "artifacts",
      "download-checkpoint.json",
    );
    await navigate("downloads");
    await card().waitForDisplayed();
    if (process.env.DMM_E2E_PHASE === "transfer") {
      if (scenario === "downloads-auth") {
        await expect(card()).not.toHaveText(expect.stringContaining("100%"));
        const completed = $('[role="tab"]*=Completed');
        await expect(completed).toHaveText("Completed (0)");
        await expect(completed).toHaveAttribute("aria-selected", "false");
        await browser.execute(
          (element: HTMLElement) => element.focus(),
          await $('[role="tab"]*=All'),
        );
        await browser.keys("ArrowRight");
        await expect($('[role="tab"]*=Active')).toBeFocused();
        await browser.keys("ArrowRight");
        await expect(completed).toBeFocused();
        await expect(completed).toHaveAttribute("aria-selected", "true");
        await expect(card()).not.toBeDisplayed();
        const failed = $('[role="tab"]*=Failed');
        await expect(failed).toHaveText("Failed (1)");
        await expect(failed).toHaveAttribute("aria-selected", "false");
        await browser.keys("ArrowRight");
        await expect(failed).toBeFocused();
        await expect(failed).toHaveAttribute("aria-selected", "true");
        await expect(card().$("button=Retry")).toBeDisplayed();
        await browser.saveScreenshot(
          path.join(world, "artifacts", "failed-download.png"),
        );
        await $('[role="tab"]*=All').click();
        await expect(card().$("button=Retry")).toBeDisplayed();
      }
      await retry();
      if (
        scenario === "downloads-pause" ||
        scenario === "downloads-cancel" ||
        scenario === "downloads-restart"
      ) {
        await pause(world);
        if (scenario === "downloads-cancel") {
          await browser.execute(
            (modId: string) =>
              window.__TAURI_INTERNALS__.invoke("cancel_download", { modId }),
            DOWNLOAD_MOD,
          );
          await waitStatus(world, "failedToDownload");
          await assertDownloadDisk(world, "cancelled", "failedToDownload");
        } else if (scenario !== "downloads-restart") {
          await card().$("button=Resume").click();
          await waitStatus(world, "downloaded");
        }
      } else if (scenario === "downloads-cancel-connecting") {
        await cancelWhileConnecting(world);
      } else if (scenario === "downloads-cancel-queued") {
        await cancelQueued(world);
      } else if (
        [
          "downloads-auth",
          "downloads-corrupt",
          "downloads-variants",
          "downloads-redirect",
        ].includes(scenario ?? "")
      ) {
        if (scenario === "downloads-auth") {
          const failure = toast(`Failed to download ${DOWNLOAD_NAME}: `);
          await failure.waitForDisplayed();
          await expect(failure).not.toHaveText(
            expect.stringContaining("{{message}}"),
          );
        }
        // The seed is already failed. Wait for this attempt's UI result before
        // accepting the same status from the asynchronous persisted store.
        await expect(card().$("button=Retry")).toBeDisplayed();
        await waitStatus(world, "failedToDownload");
        const directory = await downloadDirectory(world);
        await observeUntil(
          "Failed download cleanup",
          () => collectFileInventory(directory),
          (files) => Object.keys(files).length === 0,
        );
        await assertDownloadDisk(world, "failed", "failedToDownload");
        await retry();
        if (scenario === "downloads-auth") {
          await toast(`${DOWNLOAD_NAME} downloaded!`).waitForDisplayed();
          await browser.saveScreenshot(
            path.join(world, "artifacts", "download-toasts.png"),
          );
        }
        await waitStatus(world, "downloaded");
      } else await waitStatus(world, "downloaded");
      if (scenario !== "downloads-cancel" && scenario !== "downloads-restart")
        await assertDownloadDisk(world, "completed", "downloaded");
      await writeFile(
        checkpointPath,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else if (process.env.DMM_E2E_PHASE === "restart-download") {
      const checkpoint = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpointPath, "utf8")));
      expect(runtime.processId).not.toBe(checkpoint.processId);
      if (scenario === "downloads-cancel" || scenario === "downloads-restart") {
        await waitStatus(world, "failedToDownload");
        await assertDownloadDisk(
          world,
          "restart-incomplete",
          "failedToDownload",
          scenario === "downloads-restart",
        );
        await retry();
        await waitStatus(world, "downloaded");
      }
      await assertDownloadDisk(world, "restarted", "downloaded");
      await expect(card()).toHaveText(expect.stringContaining("Completed"));
    } else throw new Error("Unknown download phase");
    if (
      !(
        scenario === "downloads-restart" &&
        process.env.DMM_E2E_PHASE === "transfer"
      )
    ) {
      await closeApplication(world, runtime.processId);
      await assertDownloadDisk(
        world,
        `closed-${process.env.DMM_E2E_PHASE}`,
        scenario === "downloads-cancel" &&
          process.env.DMM_E2E_PHASE === "transfer"
          ? "failedToDownload"
          : "downloaded",
      );
    }
  });
});
