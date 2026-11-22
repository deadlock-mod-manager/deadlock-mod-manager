import assert from "node:assert/strict";
import path from "node:path";
import { $, $$, browser } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { CATALOG_MOD_NAME } from "../support/gamebanana-fixtures";
import { readCatalogState } from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, openModTab, waitForDisplayed } from "../support/ui";

const errorToasts = () => $$('[data-sonner-toast][data-type="error"]');

// Each phase downloads through a different caller of the queue.
const downloadFrom = {
  "download-button": async () => {
    await $('button[aria-label="Download Mod"]').click();
  },
  "model-tab": async () => {
    await openModTab("3d", "3D");
    await waitForDisplayed("button=Download for preview");
    await $("button=Download for preview").click();
  },
};

describe("download queue errors", () => {
  it("reports a download the backend refuses to queue once", async () => {
    const phase = z
      .enum(["download-button", "model-tab"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("mods");
    await waitForDisplayed(`[title="${CATALOG_MOD_NAME}"]`);
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();
    await waitForDisplayed(`//div[normalize-space()="${CATALOG_MOD_NAME}"]`);
    assert.deepEqual((await readCatalogState(world)).localMods, []);

    const messages = await step(
      "download a file GameBanana removed",
      async () => {
        await downloadFrom[phase]();
        // Every toast for the refusal is raised in the same callback, so they
        // render together.
        await browser.waitUntil(async () => (await errorToasts().length) > 0, {
          timeoutMsg: "The refused download showed no error",
        });
        // Pointer movement over the stack fans it out and holds the toasts for
        // the screenshot. WebDriver's pointer doesn't reach Sonner in WebKitGTK.
        await browser.execute(
          (toaster: HTMLElement) => {
            toaster.dispatchEvent(
              new MouseEvent("mousemove", { bubbles: true }),
            );
          },
          await $("[data-sonner-toaster]"),
        );
        // Sonner slides and fades toasts in. WebKitGTK's element location
        // ignores the slide, so the fade must finish too.
        let previous = "";
        await browser.waitUntil(
          async () => {
            const toasts = await browser.execute(() =>
              [
                ...document.querySelectorAll(
                  '[data-sonner-toast][data-type="error"]',
                ),
              ].map((toast) => {
                const { x, y } = toast.getBoundingClientRect();
                return { x, y, opacity: getComputedStyle(toast).opacity };
              }),
            );
            const current = JSON.stringify(toasts);
            const settled =
              current === previous &&
              toasts.every((toast) => toast.opacity === "1");
            previous = current;
            return settled;
          },
          { interval: 300, timeoutMsg: "The error toasts kept moving" },
        );
        await browser.saveScreenshot(
          path.join(world, "artifacts", "queue-error-toasts.png"),
        );
        return errorToasts().map((toast) => toast.getText());
      },
    );
    assert.equal(
      messages.length,
      1,
      `One refused download showed ${messages.length} error toasts: ${JSON.stringify(messages)}`,
    );
    assert.match(
      messages[0],
      new RegExp(
        `^Failed to download ${CATALOG_MOD_NAME}: .*file was not found`,
      ),
    );
    await observeUntil(
      "The refused download was not marked failed",
      () => readCatalogState(world),
      (state) => state.localMods[0]?.status === "failedToDownload",
    );
    await closeApplication(world, runtime.processId);
  });
});
