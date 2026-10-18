import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { applyInstalledFiles } from "../support/catalog-actions";
import { step } from "../support/evidence";
import { readCatalogState } from "../support/gamebanana-oracle";
import { observeUntil } from "../support/observations";
import { navigate, selectDownloads } from "../support/ui";
import { VARIANT_MOD, VARIANTS } from "../support/variant-names-fixtures";
import {
  assertVariantDisk,
  hasInstalledVersion,
  type VariantExpectation,
} from "../support/variant-names-oracle";

const [red, blue, green] = VARIANTS.map((variant) => variant.name);
const waitStatus = (world: string, status: string) =>
  observeUntil(
    `${VARIANT_MOD.id} is ${status}`,
    () => readCatalogState(world),
    (state) =>
      state.localMods.find((mod) => mod.remoteId === VARIANT_MOD.id)?.status ===
      status,
  );
const openMod = async () => {
  await navigate("mods");
  await $(`[title="${VARIANT_MOD.name}"]`).click();
};
const allEnabled = (version: "v1" | "v2"): VariantExpectation =>
  Object.fromEntries(
    VARIANTS.map((variant) => [
      variant.name,
      { state: "enabled", version } as const,
    ]),
  );

describe("variants sharing a VPK filename", () => {
  it("installs, toggles and updates every variant under its own name", async () => {
    const phase = z
      .enum(["variants", "restart"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "variant-names.json");
    const final = allEnabled("v2");
    if (phase === "variants") {
      await step("download and enable every variant", async () => {
        await openMod();
        await $('button[aria-label="Download Mod"]').click();
        await selectDownloads(VARIANTS.map((variant) => variant.archive));
        await waitStatus(world, "downloaded");
        const toggle = await $('[role="switch"]');
        await toggle.waitForClickable();
        await toggle.click();
        await waitStatus(world, "installed");
        await expect($('[role="dialog"]')).not.toBeDisplayed();
      });
      await step("every variant installed", () =>
        assertVariantDisk(world, "installed-v1", allEnabled("v1")),
      );

      await applyInstalledFiles([red, green], VARIANT_MOD.name);
      await step("blue parked", () =>
        assertVariantDisk(world, "blue-parked-v1", {
          [red]: { state: "enabled", version: "v1" },
          [blue]: { state: "parked", version: "v1" },
          [green]: { state: "enabled", version: "v1" },
        }),
      );

      await step("update keeps blue unselected", async () => {
        await navigate("my-mods");
        const check = await $("button=Check for updates");
        await check.waitForEnabled({ timeout: 30_000 });
        await check.click();
        await $("button=1 update available").click();
        const dialog = await $('[role="dialog"]');
        await expect(dialog).toHaveText(
          expect.stringContaining(VARIANT_MOD.name),
        );
        await dialog.$("button=Update All").click();
        await expect(dialog).not.toBeDisplayed({ wait: 30_000 });
        await observeUntil(
          "v2 bytes installed",
          async () =>
            (await hasInstalledVersion(world, red, "v2")) &&
            (await hasInstalledVersion(world, green, "v2")),
          Boolean,
        );
        // Blue's parked copy is v1, so the update drops it.
        await assertVariantDisk(world, "updated-v2", {
          [red]: { state: "enabled", version: "v2" },
          [green]: { state: "enabled", version: "v2" },
        });
      });

      await openMod();
      await applyInstalledFiles([red, blue, green], VARIANT_MOD.name);
      await step("blue re-enabled from the update", () =>
        assertVariantDisk(world, "blue-enabled-v2", final),
      );
      await writeFile(
        checkpoint,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else {
      const previous = z
        .object({ processId: z.number() })
        .parse(JSON.parse(await readFile(checkpoint, "utf8")));
      assert.notEqual(runtime.processId, previous.processId);
      await step("fresh process keeps every variant", () =>
        assertVariantDisk(world, "restarted", final),
      );
    }
    await closeApplication(world, runtime.processId);
    await assertVariantDisk(world, `closed-${phase}`, final);
  });
});
