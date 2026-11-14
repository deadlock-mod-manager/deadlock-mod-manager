import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  chooseInstalledFiles,
  closeCatalogOptions,
} from "../support/catalog-actions";
import { step } from "../support/evidence";
import {
  assertModOptionsVariantDisk,
  BASE_FILE,
  CHECKSUM_FILE,
  FALLBACK_FILE,
  OPTIONS_MOD,
  OVERSIZE_FILE,
} from "../support/mod-options-variant-fixtures";
import { navigate, reveal, waitForOverlaysClosed } from "../support/ui";

const openOptions = async () => {
  await waitForOverlaysClosed();
  const button = await $(
    `[data-library-mod="${OPTIONS_MOD.id}"] button[aria-label="Manage files"]`,
  );
  await reveal(button);
  await button.click();
  const dialog = await $('[role="dialog"]');
  await expect(dialog).toHaveText(
    expect.stringContaining(`Manage Files: ${OPTIONS_MOD.name}`),
  );
  return dialog;
};

const applyFiles = async (names: string[]) => {
  const dialog = await openOptions();
  const installed = await chooseInstalledFiles(names);
  await installed.$("button=Apply").click();
  await expect(dialog).not.toBeDisplayed();
};

const rejectVariant = (world: string, name: string, reason: string) =>
  step(`reject missing ${name}`, async () => {
    const dialog = await openOptions();
    const installed = await chooseInstalledFiles([BASE_FILE, name]);
    await installed.$("button=Apply").click();
    await expect(
      $(
        `//*[@data-sonner-toast and @data-type="error" and contains(., "${reason}")]`,
      ),
    ).toBeDisplayed();
    await expect(dialog).toBeDisplayed();
    await expect(installed.$("button=Apply")).toBeEnabled();
    await assertModOptionsVariantDisk(world, `rejected-${name}`, "parked");
    await closeCatalogOptions();
    await waitForOverlaysClosed();
  });

describe("Mod Options missing variant downloads", () => {
  it("uses the resolved fallback, size cap and checksum", async () => {
    const phase = z
      .enum(["missing-variants", "restart"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    const card = await $(`[data-library-mod="${OPTIONS_MOD.id}"]`);
    await card.waitForDisplayed();

    if (phase === "missing-variants") {
      await step("only the base variant starts on disk", () =>
        assertModOptionsVariantDisk(world, "initial", "absent"),
      );
      await step("fetch a missing variant through its fallback", async () => {
        await applyFiles([BASE_FILE, FALLBACK_FILE]);
        await assertModOptionsVariantDisk(
          world,
          "fallback-installed",
          "installed",
        );
      });
      await waitForOverlaysClosed();
      await step("park the fetched variant with its exact bytes", async () => {
        await applyFiles([BASE_FILE]);
        await assertModOptionsVariantDisk(world, "fallback-parked", "parked");
      });
      await waitForOverlaysClosed();
      await rejectVariant(
        world,
        OVERSIZE_FILE,
        "Refusing to download 2147483649 bytes (limit 2147483648)",
      );
      await rejectVariant(
        world,
        CHECKSUM_FILE,
        "Downloaded file checksum did not match GameBanana metadata",
      );
    } else {
      await step(
        "fresh process retains only the successful variant",
        async () => {
          await assertModOptionsVariantDisk(world, "restart", "parked");
          const dialog = await openOptions();
          const installed = await chooseInstalledFiles([BASE_FILE]);
          assert.equal(await installed.$("button=Apply").isEnabled(), false);
          await expect(dialog).toBeDisplayed();
          await closeCatalogOptions();
        },
      );
    }
    await closeApplication(world, runtime.processId);
    await assertModOptionsVariantDisk(world, `closed-${phase}`, "parked");
  });
});
