import { $, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  CATALOG_MOD_ID,
  CATALOG_MOD_NAME,
  catalogVpk,
} from "../support/gamebanana-fixtures";
import { observeUntil, readPersistedDocument } from "../support/observations";
import { openCatalogOptions, applyArchives } from "../support/catalog-actions";
import { step } from "../support/evidence";
import { navigate, waitForDisplayed } from "../support/ui";

const readDetectedMod = async (world: string) =>
  z
    .object({
      state: z.object({
        localMods: z
          .array(z.object({ remoteId: z.string(), status: z.string() }))
          .default([]),
      }),
    })
    .parse(await readPersistedDocument(world))
    .state.localMods.find((mod) => mod.remoteId === CATALOG_MOD_ID);

describe("existing detected mod files", () => {
  it("shows the identified archive as enabled when managing other files", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    if (process.env.DMM_E2E_PHASE === "detect-files") {
      await navigate("my-mods");
      await waitForDisplayed("button=Analyze");
      await $("button=Analyze").click();
      await observeUntil(
        "Existing mod was recognized as installed",
        () => readDetectedMod(world),
        (mod) => mod?.status === "installed",
      );
    }
    await navigate("mods");
    await waitForDisplayed(`[title="${CATALOG_MOD_NAME}"]`);
    await $(`[title="${CATALOG_MOD_NAME}"]`).click();
    await waitForDisplayed("button=Manage files");
    const dialog = await openCatalogOptions();
    await step("detected archive is enabled and available", async () => {
      const row = await dialog.$('[data-download-archive="common.zip"]');
      await expect(row.$('[role="checkbox"]')).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(row).toHaveText(expect.stringContaining("Enabled"));
      await expect(row).not.toHaveText(
        expect.stringContaining("needs download"),
      );
      const optional = await dialog.$('[data-download-archive="blue.zip"]');
      if (process.env.DMM_E2E_PHASE === "detect-files") {
        await expect(optional).toHaveText(
          expect.stringContaining("needs download"),
        );
      } else {
        await expect(optional.$('[role="checkbox"]')).toHaveAttribute(
          "aria-checked",
          "true",
        );
        await expect(optional).not.toHaveText(
          expect.stringContaining("needs download"),
        );
      }
    });
    await dialog.$("button=Cancel").click();
    if (process.env.DMM_E2E_PHASE === "detect-files") {
      await applyArchives(["common.zip", "blue.zip"]);
    } else {
      await applyArchives(["common.zip"]);
    }
    await step(
      "existing VPK bytes and ownership survive file management",
      async () => {
        const addons = path.join(
          world,
          "game-install",
          "game",
          "citadel",
          "addons",
        );
        const manifest = z
          .object({
            mods: z.record(
              z.string(),
              z.object({
                currentVpks: z.array(z.string()),
                originalVpkNames: z.array(z.string()),
              }),
            ),
          })
          .parse(
            JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")),
          );
        const entry = manifest.mods[CATALOG_MOD_ID];
        expect(entry.currentVpks).toHaveLength(
          process.env.DMM_E2E_PHASE === "detect-files" ? 2 : 1,
        );
        const originalIndex = entry.originalVpkNames.indexOf("pak01_dir.vpk");
        expect(originalIndex).toBeGreaterThanOrEqual(0);
        expect(
          await readFile(path.join(addons, entry.currentVpks[originalIndex])),
        ).toEqual(catalogVpk("common.vpk"));
      },
    );
    await closeApplication(world, runtime.processId);
  });
});
