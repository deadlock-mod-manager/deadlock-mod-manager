import { browser } from "@wdio/globals";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { sendDeepLink } from "../support/deep-link";
import { step } from "../support/evidence";
import { CATALOG_MOD_ID, catalogVpk } from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { navigate } from "../support/ui";
import { assertOwnedWorld } from "../support/world";

const readMod = async (world: string) => {
  const { state } = z
    .object({
      state: z.object({
        activeProfileId: z.string(),
        profiles: z.record(
          z.string(),
          z.object({
            enabledMods: z.record(
              z.string(),
              z.object({ enabled: z.boolean() }),
            ),
          }),
        ),
        localMods: z.array(
          z.object({ remoteId: z.string(), status: z.string() }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  return {
    status: state.localMods.find((mod) => mod.remoteId === CATALOG_MOD_ID)
      ?.status,
    enabled:
      state.profiles[state.activeProfileId]?.enabledMods[CATALOG_MOD_ID]
        ?.enabled,
  };
};

describe("GameBanana 1-click links", () => {
  it("leave the installed mod enabled in its profile", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await sendDeepLink(CATALOG_MOD_ID, 910001);
    await step("wait for the mod to be installed", () =>
      observeUntil(
        "mod installed",
        () => readMod(world),
        ({ status }) => status === "installed",
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

    assert.deepEqual(await readMod(world), {
      status: "installed",
      enabled: true,
    });
    const { configuration } = await assertOwnedWorld(world);
    const addons = path.join(
      configuration.roots.game,
      "game",
      "citadel",
      "addons",
    );
    const manifest = z
      .object({
        mods: z.record(
          z.string(),
          z.object({ enabled: z.boolean(), currentVpks: z.array(z.string()) }),
        ),
      })
      .parse(
        JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
      );
    assert.deepEqual(manifest.mods[CATALOG_MOD_ID], {
      enabled: true,
      currentVpks: ["pak01_dir.vpk"],
    });
    assert.deepEqual(
      await readFile(path.join(addons, "pak01_dir.vpk")),
      catalogVpk("base.vpk"),
    );
  });
});
