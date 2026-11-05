import { access } from "node:fs/promises";
import { $, browser, expect } from "@wdio/globals";
import { step } from "./evidence";
import { reveal, waitForOverlaysClosed } from "./ui";

export const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

export const applyPreset = (presetId: string) =>
  step(`apply ${presetId}`, async () => {
    const card = await $(`article[data-config-id="preset:${presetId}"]`);
    const apply = await card.$("button*=Apply");
    await reveal(apply);
    await apply.click();
    await expect(card).toHaveText(expect.stringContaining("Applied"));
  });

// A status refresh re-renders the tabs and can swallow a click, so look the
// tab up again and retry, falling back to the keyboard, until it is selected.
export const openTab = async (name: string) => {
  const tab = `//button[@role="tab"][normalize-space()="${name}"]`;
  await reveal(await $(tab));
  await browser.waitUntil(
    async () => {
      if ((await $(tab).getAttribute("aria-selected")) === "true") return true;
      await $(tab).click();
      if ((await $(tab).getAttribute("aria-selected")) === "true") return true;
      await browser.execute((node: HTMLElement) => node.focus(), await $(tab));
      await browser.keys("Enter");
      return false;
    },
    { timeoutMsg: `${name} tab never opened` },
  );
};

export const confirmDialog = async () => {
  const confirm = await $('[role="alertdialog"] button[type="submit"]');
  await confirm.waitForClickable();
  await confirm.click();
  await waitForOverlaysClosed();
};

export const turnOff = () =>
  step("turn the config off", async () => {
    const button = await $("button=Turn off");
    await reveal(button);
    await button.click();
    await confirmDialog();
    await expect(button).not.toBeDisplayed();
  });

/** Coming back to the window from the game, as alt-tab does. */
export const refocusWindow = () =>
  browser.execute(() => window.dispatchEvent(new Event("focus")));
