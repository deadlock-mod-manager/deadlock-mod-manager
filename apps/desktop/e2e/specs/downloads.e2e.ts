import { $, browser, expect } from "@wdio/globals";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
} from "../support/download-fixtures";
import {
  assertDownloadDisk,
  downloadDirectory,
  readDownloadState,
} from "../support/download-oracle";

const card = () => $(`[role="button"][aria-label="Open ${DOWNLOAD_NAME}"]`);
const waitStatus = async (world: string, status: string): Promise<void> => {
  await browser.waitUntil(
    async () => (await readDownloadState(world))[0]?.status === status,
    { timeout: 20_000, timeoutMsg: `Download did not reach ${status}` },
  );
};
const retry = async (): Promise<void> => {
  const button = await card().$("button=Retry");
  await button.waitForClickable();
  await button.click();
};
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

describe("real Rust downloads", () => {
  it("keeps UI, partial files and selected payload consistent across failure and restart", async () => {
    const dismiss = await $("button=Got it!");
    if (await dismiss.isDisplayed()) await dismiss.click();
    const runtime = await browser.execute(() =>
      window.__TAURI_INTERNALS__.invoke<{
        processId: number;
        roots: { world: string };
      }>("e2e_status"),
    );
    const world = runtime.roots.world;
    const scenario = process.env.DMM_E2E_CASE_ID;
    const checkpointPath = path.join(
      world,
      "artifacts",
      "download-checkpoint.json",
    );
    await $('a[href="/downloads"]').click();
    await card().waitForDisplayed();
    if (process.env.DMM_E2E_PHASE === "transfer") {
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
      } else if (
        [
          "downloads-auth",
          "downloads-corrupt",
          "downloads-variants",
          "downloads-redirect",
        ].includes(scenario ?? "")
      ) {
        await waitStatus(world, "failedToDownload");
        await assertDownloadDisk(world, "failed", "failedToDownload");
        await expect(card().$("button=Retry")).toBeDisplayed();
        await retry();
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
  });
});
