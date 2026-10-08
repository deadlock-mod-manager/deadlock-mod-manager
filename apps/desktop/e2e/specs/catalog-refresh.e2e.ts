import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { REFRESH_SOUND_NAME } from "../support/catalog-refresh-fixtures";
import { contentMods } from "../support/content-fixtures";
import { step } from "../support/evidence";
import { navigate, waitForDisplayed } from "../support/ui";

describe("manual catalog refresh", () => {
  it("finds a newly uploaded sound within the automatic cooldown and keeps saved mods", async () => {
    const runtime = await startApplication();
    await navigate("mods");
    await waitForDisplayed(`[title="${contentMods[0].name}"]`);
    const refresh = $('button[aria-label="Refresh catalog"]');
    await expect(refresh).toBeEnabled();
    await $("button=Sounds").click();
    await expect($(`[title="${REFRESH_SOUND_NAME}"]`)).not.toExist();

    await step(
      "refresh bypasses the cooldown and adds the new sound",
      async () => {
        await refresh.click();
        await expect(
          $('button[aria-label="Refreshing catalog…"]'),
        ).toBeDisabled();
        await waitForDisplayed(`[title="${REFRESH_SOUND_NAME}"]`);
        await expect(refresh).toBeEnabled();
      },
    );
    await step(
      "repeated refresh preserves results without rehydrating unchanged entries",
      async () => {
        await refresh.click();
        await expect(
          $('button[aria-label="Refreshing catalog…"]'),
        ).toBeDisabled();
        await expect($(`[title="${REFRESH_SOUND_NAME}"]`)).toBeDisplayed();
        await expect(refresh).toBeEnabled();
        await $("button=Mods").click();
        await waitForDisplayed(`[title="${contentMods[0].name}"]`);
      },
    );
    await browser.saveScreenshot(
      `${runtime.roots.world}/artifacts/catalog-refresh.png`,
    );
    await closeApplication(runtime.roots.world, runtime.processId);
  });
});
