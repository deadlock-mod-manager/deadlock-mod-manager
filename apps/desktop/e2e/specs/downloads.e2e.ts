import { navigate } from "../support/ui";
import { observeUntil } from "../support/observations";
import { collectFileInventory } from "../support/world";
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
} from "../support/download-fixtures";
import {
  assertDownloadDisk,
  downloadDirectory,
  readDownloadState,
} from "../support/download-oracle";

const card = () => $(`[role="button"][aria-label="Open ${DOWNLOAD_NAME}"]`);
const waitStatus = async (world: string, status: string): Promise<void> => {
  await observeUntil(
    `Download did not reach ${status}`,
    () => readDownloadState(world),
    (mods) => mods[0]?.status === status,
    20_000,
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
        const directory = await downloadDirectory(world);
        await observeUntil(
          "Failed download cleanup",
          () => collectFileInventory(directory),
          (files) => Object.keys(files).length === 0,
        );
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
