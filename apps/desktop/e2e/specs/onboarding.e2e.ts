import { readFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { waitForDisplayed } from "../support/ui";

const next = () => $("button=Next");
const expectTelemetry = () =>
  waitForDisplayed("label=Share anonymous usage data");

describe("onboarding existing addons", () => {
  it("can skip after closing analysis and after returning to the addons step", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const addonPath = path.join(
      world,
      "game-install",
      "game",
      "citadel",
      "addons",
      "pak01_dir.vpk",
    );
    const originalAddon = await readFile(addonPath);

    await step("reach existing mods through setup", async () => {
      await $("#acknowledge-disclaimer").click();
      for (const title of [
        "Game Path Detection",
        "API Connection",
        "Download Server",
        "Existing Mods",
      ]) {
        await browser.waitUntil(() => next().isEnabled());
        await next().click();
        await waitForDisplayed(`h3=${title}`);
      }
      await waitForDisplayed("button=Analyze Mods");
    });

    await step("skip advances before analyzing any mods", async () => {
      await $("button=Skip for Now").click();
      await expectTelemetry();
      await $("#telemetry-consent-switch").click();
      await $("button=Back").click();
      await waitForDisplayed("button=Analyze Mods");
    });

    await step("analyze the existing VPK and back out", async () => {
      await $("button=Analyze Mods").click();
      await waitForDisplayed("h2=Local Addon Analysis");
      await expect(
        $(
          "//div[@role='dialog' and .//h2[normalize-space()='Local Addon Analysis']]",
        ),
      ).toHaveText(expect.stringContaining("pak01_dir.vpk"));
      await browser.keys("Escape");
      await waitForDisplayed("button=Skip for Now");
      await expect($("h2=Local Addon Analysis")).not.toBeDisplayed();
      await expect($("button=Skip for Now")).toBeEnabled();
    });

    await step("skip analysis advances to telemetry", async () => {
      await $("button=Skip for Now").click();
      await expectTelemetry();
      await expect($("button=Analyze Mods")).not.toBeDisplayed();
    });

    await step("skip also advances after navigating back", async () => {
      await $("button=Back").click();
      await waitForDisplayed("button=Skip for Now");
      await $("button=Skip for Now").click();
      await expectTelemetry();
    });

    await step("Next still advances past existing mods", async () => {
      await $("button=Back").click();
      await waitForDisplayed("button=Analyze Mods");
      await next().click();
      await expectTelemetry();
    });

    await expect($("button=Skip Setup")).toBeDisplayed();
    expect(await readFile(addonPath)).toEqual(originalAddon);
    await $("button=Skip Setup").click();
    await closeApplication(world, runtime.processId);
  });
});
