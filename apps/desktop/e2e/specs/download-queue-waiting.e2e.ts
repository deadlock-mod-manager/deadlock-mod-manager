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

const TRANSFER = /[\d.]+ (KB|MB)\/s/;
/** Ample for a pause, resume or queue IPC to reach the backend. */
const SETTLE_MS = 2_000;
const card = (name: string) => $(`[role="button"][aria-label="Open ${name}"]`);
const subtitle = () => $("p*=total");
const bottomBar = () => $('[data-bottom-bar="true"]');
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
const screenshot = (world: string, name: string) =>
  browser.saveScreenshot(path.join(world, "artifacts", `${name}.png`));
const waitTransferring = (name: string) =>
  browser.waitUntil(async () => TRANSFER.test(await card(name).getText()), {
    timeout: 20_000,
    timeoutMsg: `${name} never showed a transfer speed`,
  });

/** The card, header and bottom bar while the download waits behind the blocker. */
const expectWaiting = async (blocker: string) => {
  const text = await card(DOWNLOAD_NAME).getText();
  expect(text).toContain("Waiting");
  expect(text).not.toContain("B/s");
  expect(text).not.toContain("%");
  await expect(card(DOWNLOAD_NAME).$(".downloads-shimmer")).not.toBeExisting();
  await expect(card(DOWNLOAD_NAME).$("button=Pause")).toBeDisplayed();
  await expect(card(DOWNLOAD_NAME).$("button=Cancel")).toBeDisplayed();
  await expect(subtitle()).toHaveText(
    expect.stringContaining("1 active, 1 waiting,"),
  );
  await expect(bottomBar()).toHaveText(
    expect.stringContaining("1 downloading"),
  );
  await expect(bottomBar()).toHaveText(expect.stringContaining("1 waiting"));
  // The download holding the queue keeps its speed.
  expect(await card(blocker).getText()).toMatch(TRANSFER);
};

describe("queued download waiting label", () => {
  it("shows a queued download as waiting until it starts", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("downloads");
    await card(DOWNLOAD_NAME).waitForDisplayed();
    await card(QUEUE_NAME).waitForDisplayed();

    await step("a long download holds the queue", async () => {
      await click(QUEUE_NAME, "Retry");
      await waitStatus(world, QUEUE_MOD, "downloading");
      await waitTransferring(QUEUE_NAME);
    });

    await step("the queued download waits and isn't counted", async () => {
      await click(DOWNLOAD_NAME, "Retry");
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      await browser.pause(SETTLE_MS);
      await screenshot(world, "queued-waiting");
      expect(await requestCount(world, DOWNLOAD_FILE)).toBe(0);
      await expectWaiting(QUEUE_NAME);
    });

    await step("paused while it waits, it reads Paused", async () => {
      await click(DOWNLOAD_NAME, "Pause");
      await waitStatus(world, DOWNLOAD_MOD, "paused");
      await browser.pause(SETTLE_MS);
      await screenshot(world, "queued-paused");
      expect(await requestCount(world, DOWNLOAD_FILE)).toBe(0);
      expect(await card(DOWNLOAD_NAME).getText()).not.toContain("Waiting");
      await expect(card(DOWNLOAD_NAME).$("button=Resume")).toBeDisplayed();
      await expect(card(DOWNLOAD_NAME).$("button=Cancel")).toBeDisplayed();
      await expect(subtitle()).toHaveText(
        expect.stringContaining("1 active, 1 paused, 0 completed"),
      );
      await expect(bottomBar()).toHaveText(
        expect.stringContaining("1 downloading"),
      );
      await expect(bottomBar()).toHaveText(expect.stringContaining("1 paused"));
      await expect(bottomBar()).not.toHaveText(
        expect.stringContaining("waiting"),
      );
    });

    await step("resumed, it waits again", async () => {
      await click(DOWNLOAD_NAME, "Resume");
      await waitStatus(world, DOWNLOAD_MOD, "downloading");
      await browser.pause(SETTLE_MS);
      await screenshot(world, "resumed-waiting");
      expect(await requestCount(world, DOWNLOAD_FILE)).toBe(0);
      await expectWaiting(QUEUE_NAME);
    });

    await step("it shows Downloading once it starts", async () => {
      await click(QUEUE_NAME, "Cancel");
      await waitStatus(world, QUEUE_MOD, "failedToDownload");
      await waitTransferring(DOWNLOAD_NAME);
      await screenshot(world, "started-downloading");
      expect(await card(DOWNLOAD_NAME).getText()).not.toContain("Waiting");
      await expect(card(DOWNLOAD_NAME).$(".downloads-shimmer")).toBeExisting();
      await expect(subtitle()).toHaveText(
        expect.stringContaining("1 active, 0 completed"),
      );
      await expect(bottomBar()).toHaveText(
        expect.stringContaining("1 downloading"),
      );
      await expect(bottomBar()).not.toHaveText(
        expect.stringContaining("waiting"),
      );
    });

    await step(
      "paused after it started and resumed behind another, it waits again",
      async () => {
        await click(QUEUE_NAME, "Retry");
        await waitStatus(world, QUEUE_MOD, "downloading");
        await browser.pause(SETTLE_MS);
        expect(await card(QUEUE_NAME).getText()).toContain("Waiting");
        // Pausing gives the queue to the blocker.
        await click(DOWNLOAD_NAME, "Pause");
        await waitStatus(world, DOWNLOAD_MOD, "paused");
        await waitTransferring(QUEUE_NAME);
        await click(DOWNLOAD_NAME, "Resume");
        await waitStatus(world, DOWNLOAD_MOD, "downloading");
        await browser.pause(SETTLE_MS);
        await screenshot(world, "resumed-behind");
        expect(await requestCount(world, DOWNLOAD_FILE)).toBe(1);
        await expectWaiting(QUEUE_NAME);
      },
    );

    await step("it continues once the queue frees up", async () => {
      await click(QUEUE_NAME, "Cancel");
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
