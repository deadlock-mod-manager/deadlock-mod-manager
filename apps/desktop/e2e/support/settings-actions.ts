import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import { navigate, reveal } from "./ui";
import { step } from "./evidence";

export const readSettings = async (world: string) =>
  z
    .object({ state: z.record(z.string(), z.json()) })
    .parse(await readPersistedDocument(world)).state;

export const openSettings = (tab: string) =>
  step(`open ${tab} settings`, async () => {
    await navigate("settings");
    const control = await $(`[data-settings-tab="${tab}"]`);
    await reveal(control);
    await control.click();
    await expect(control).toHaveAttribute("aria-selected", "true");
  });

export const setSwitch = (selector: string, enabled: boolean) =>
  step(`set ${selector} to ${enabled}`, async () => {
    const control = await $(selector);
    await reveal(control);
    await control.waitForClickable();
    if ((await control.getAttribute("aria-checked")) !== String(enabled))
      await control.click();
    await expect($(selector)).toHaveAttribute("aria-checked", String(enabled));
  });

export const selectSetting = (selector: string, option: string) =>
  step(`select ${option}`, async () => {
    const control = await $(selector);
    await reveal(control);
    await control.click();
    const item = await $(
      `//*[@role="option" and (normalize-space()="${option}" or .//span[normalize-space()="${option}"])]`,
    );
    await item.waitForDisplayed();
    await item.click();
    await expect($(selector)).toHaveText(expect.stringContaining(option));
  });

export const moveSlider = async (selector: string, steps: number) => {
  const slider = await $(selector);
  await reveal(slider);
  await slider.click();
  const minimum = await slider.getAttribute("aria-valuemin");
  if (minimum === null) throw new Error(`Slider ${selector} has no minimum`);
  for (let index = 0; index < 100; index++) {
    if ((await slider.getAttribute("aria-valuenow")) === minimum) break;
    await browser.keys("ArrowLeft");
  }
  await expect(slider).toHaveAttribute("aria-valuenow", minimum);
  for (let index = 0; index < steps; index++) await browser.keys("ArrowRight");
};
