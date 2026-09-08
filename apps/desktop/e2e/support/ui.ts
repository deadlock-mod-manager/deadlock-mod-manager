import { $, browser, expect } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";
import { step } from "./evidence";

export const navigate = (
  destination: "mods" | "my-mods" | "downloads" | "settings",
) =>
  step(`open ${destination}`, async () => {
    const link = await $(`a[href="/${destination}"]`);
    await link.waitForClickable();
    await link.click();
    await expect(browser).toHaveUrl(expect.stringContaining(`/${destination}`));
  });
export const reveal = async (
  element: ChainablePromiseElement,
): Promise<void> => {
  await browser.execute(
    (node: HTMLElement) =>
      node.scrollIntoView({ block: "center", behavior: "instant" }),
    element,
  );
  await browser.waitUntil(() => element.isDisplayed({ withinViewport: true }), {
    timeoutMsg: "Target did not become visible in the viewport",
  });
};
export const openOrdering = () =>
  step("open mod ordering", async () => {
    await expect($('[role="dialog"]')).not.toBeDisplayed();
    const menu = await $("button=Add Local Mod").$(
      './following-sibling::button[@aria-haspopup="menu"]',
    );
    await menu.waitForClickable();
    await menu.click();
    await expect(menu).toBeFocused();
    await browser.keys("ArrowDown");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await $(
      '//*[@role="menuitem" and normalize-space()="Change Mods Order"]',
    ).click();
    await $('[aria-roledescription="sortable"]').waitForDisplayed();
  });
export const activateProfile = (name: string) =>
  step(`activate profile ${name}`, async () => {
    await $('button[aria-label="Active Profile"]').click();
    const toggle = await $(
      `[role="switch"][aria-label="Activate ${name} profile"]`,
    );
    await toggle.waitForClickable();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await browser.keys("Escape");
    await expect($('button[aria-label="Active Profile"]')).toHaveText(
      expect.stringContaining(name),
    );
  });
export const selectDownloads = (names: readonly string[]) =>
  step("select archive downloads", async () => {
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed();
    await expect(dialog.$("button=Download Selected")).toBeDisabled();
    for (const name of names) {
      const checkbox = await dialog.$(`[id="file-${name}"]`);
      await expect(checkbox).toHaveAttribute("aria-checked", "false");
      await checkbox.click();
    }
    await dialog.$("button=Download Selected").click();
    await expect(dialog).not.toBeDisplayed();
  });
export const deselectInstallFile = (name: string) =>
  step(`deselect ${name}`, async () => {
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed();
    const row = await dialog.$(`[data-install-file="${name}"]`);
    await row.click();
    await expect(row.$('[role="checkbox"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
export const installedFiles = () => $('[data-testid="installed-files"]');
export const activeFiles = () => $('[data-testid="active-vpks"]');
