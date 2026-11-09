import { browser } from "@wdio/globals";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { sendDeepLink } from "../support/deep-link";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID } from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { navigate } from "../support/ui";

const modStatus = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z.array(
          z.object({ remoteId: z.string(), status: z.string() }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world))
    .state.localMods.find((mod) => mod.remoteId === CATALOG_MOD_ID)?.status;

describe("GameBanana 1-click links", () => {
  it("leave the installed mod enabled in its profile", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await sendDeepLink(CATALOG_MOD_ID, 910001);
    await step("wait for the mod to be installed", () =>
      observeUntil(
        "mod installed",
        () => modStatus(world),
        (status) => status === "installed",
        30_000,
      ),
    );

    // Find a broken mod tests only the mods the profile counts as enabled.
    await step("open Find a broken mod", async () => {
      await navigate("my-mods");
      await $('button[aria-label="More actions"]').click();
      await browser.keys("ArrowDown");
      await $(
        '//*[@role="menuitem" and normalize-space()="Find a broken mod"]',
      ).click();
      await $('//*[@role="dialog"]//button[normalize-space()="Skip"]').click();
    });
    const setup = $(
      '//*[@role="dialog"][.//h2[normalize-space()="Find a broken mod"]]',
    );
    await expect(setup.$(`#bisect-mod-${CATALOG_MOD_ID}`)).toHaveAttribute(
      "data-state",
      "checked",
    );
    await browser.saveScreenshot(
      path.join(world, "artifacts", "deep-link-find-broken-mod.png"),
    );
    await closeApplication(world, runtime.processId);
  });
});
