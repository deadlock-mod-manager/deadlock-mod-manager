import { navigate } from "../support/ui";
import { step } from "../support/evidence";
import { fingerprint, observeUntil } from "../support/observations";
import { assertOwnedWorld, collectFileInventory } from "../support/world";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { $, browser, expect } from "@wdio/globals";
import path from "node:path";
import { z } from "zod";
import {
  DOWNLOAD_FILE,
  DOWNLOAD_MOD,
  DOWNLOAD_NAME,
  QUEUE_MOD,
  QUEUE_NAME,
  downloadPayload,
} from "../support/download-fixtures";
import { readDownloadState } from "../support/download-oracle";

const card = (name: string) => $(`[role="button"][aria-label="Open ${name}"]`);
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
const requestCount = async (world: string, file: string) => {
  const { configuration } = await assertOwnedWorld(world);
  const origin = configuration.endpoints[0].origin;
  return z
    .object({ requests: z.array(z.object({ url: z.string() })) })
    .parse(await (await fetch(`${origin}/__control/requests`)).json())
    .requests.filter(({ url }) => url === `/downloads/${file}`).length;
};

describe("queued download pause", () => {
  it("offers Pause only once a queued download starts", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("downloads");
    await card(DOWNLOAD_NAME).waitForDisplayed();
    await card(QUEUE_NAME).waitForDisplayed();

    await step("a long download holds the queue", async () => {
      await click(QUEUE_NAME, "Retry");
      await waitStatus(world, QUEUE_MOD, "downloading");
      await browser.waitUntil(
        async () => /[\d.]+ (KB|MB)\/s/.test(await card(QUEUE_NAME).getText()),
        { timeout: 20_000, timeoutMsg: "The queue blocker never transferred" },
      );
      await expect(card(QUEUE_NAME).$("button=Pause")).toBeDisplayed();
    });

    await step("the queued download offers Cancel but no Pause", async () => {
      await click(DOWNLOAD_NAME, "Retry");
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      await expect(card(DOWNLOAD_NAME).$("button=Cancel")).toBeDisplayed();
      await browser.pause(2_000);
      await browser.saveScreenshot(
        path.join(world, "artifacts", "queued-pause.png"),
      );
      expect(await requestCount(world, DOWNLOAD_FILE)).toBe(0);
      await expect(card(DOWNLOAD_NAME).$("button=Pause")).not.toBeExisting();
      // The running download keeps its own controls.
      await expect(card(QUEUE_NAME).$("button=Pause")).toBeDisplayed();
      expect(await statusOf(world, QUEUE_MOD)).toBe("downloading");
    });

    await step("Cancel still drops the queued download", async () => {
      await click(DOWNLOAD_NAME, "Cancel");
      await waitStatus(world, DOWNLOAD_MOD, "failedToDownload");
      await click(DOWNLOAD_NAME, "Retry");
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      expect(await requestCount(world, DOWNLOAD_FILE)).toBe(0);
      await expect(card(DOWNLOAD_NAME).$("button=Pause")).not.toBeExisting();
    });

    await step("Pause appears and works once it starts", async () => {
      await click(QUEUE_NAME, "Cancel");
      await waitStatus(world, QUEUE_MOD, "failedToDownload");
      await click(DOWNLOAD_NAME, "Pause");
      await waitStatus(world, DOWNLOAD_MOD, "paused");
      await expect(card(DOWNLOAD_NAME).$("button=Resume")).toBeDisplayed();
      await browser.saveScreenshot(
        path.join(world, "artifacts", "started-paused.png"),
      );
      await click(DOWNLOAD_NAME, "Resume");
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
