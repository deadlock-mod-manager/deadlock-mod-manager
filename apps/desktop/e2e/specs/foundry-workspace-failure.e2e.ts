import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  assertFoundryDisk,
  FOUNDRY_MATERIAL,
  FOUNDRY_MOD_NAME,
  FOUNDRY_TEXTURE,
  foundryMaterialBytes,
  foundryWorkspaceRoot,
  readFoundryJournals,
  WORKSPACE_FAILURE,
} from "../support/foundry-fixtures";
import { observeUntil } from "../support/observations";
import { assertOwnedWorld } from "../support/world";

const revert = () => $("button=Revert to original");

describe("Foundry workspace preparation failure", () => {
  it("keeps the shell usable and retries preparation after the obstruction is removed", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const {
      configuration: { roots },
    } = await assertOwnedWorld(world);
    const banner = $(
      '//div[@role="status" and .//button[normalize-space()="Retry"]]',
    );
    const exportButton = $("button=Export VPK");
    const replace = $("button*=Drop a .vmat_c");

    await step(
      "open the skin with a file blocking its workspace directory",
      async () => {
        await $('a[href="/foundry"]').click();
        await $('button[role="tab"]*=Installed skins').click();
        await $(`//button[.//*[@title="${FOUNDRY_MOD_NAME}"]]`).click();
        await expect(banner).toHaveText(
          expect.stringContaining(WORKSPACE_FAILURE),
        );
        await expect(exportButton).toBeDisabled();
        await expect(exportButton).toHaveAttribute("title", WORKSPACE_FAILURE);
        await expect($(`button[title="${FOUNDRY_TEXTURE}"]`)).toBeDisplayed();
        await expect($("p=Select a model to preview Kelvin")).toBeDisplayed();
        await $(`button[title="${FOUNDRY_MATERIAL}"]`).click();
        await expect(replace).toBeDisabled();
        await expect(revert()).toBeDisabled();
      },
    );

    await step(
      "remove the obstruction and retry the same loaded skin",
      async () => {
        const obstruction = path.join(roots.appData, "foundry");
        assert.equal(
          await readFile(obstruction, "utf8"),
          "E2E workspace obstruction\n",
        );
        await unlink(obstruction);
        await $("button=Retry").click();
        await expect(exportButton).toBeEnabled();
        await expect(exportButton).not.toHaveAttribute(
          "title",
          WORKSPACE_FAILURE,
        );
        await expect(banner).not.toBeDisplayed();
        await expect(replace).toBeEnabled();
        const root = await foundryWorkspaceRoot(world);
        assert.deepEqual(
          await readFile(path.join(root, "files", FOUNDRY_MATERIAL)),
          foundryMaterialBytes(),
        );
      },
    );

    await step(
      "paint and revert an asset after the successful retry",
      async () => {
        await $('button[role="tab"]*=Paint').click();
        await $(
          '//button[@aria-pressed and .//span[normalize-space()="Body"]]',
        ).click();
        await $("button=Paint Body").click();
        const root = await foundryWorkspaceRoot(world);
        await observeUntil(
          "Painting is journaled",
          () => readFoundryJournals(root),
          (journals) => journals.edits.includes(FOUNDRY_TEXTURE),
        );
        await $('button[role="tab"]*=Assets').click();
        await $(`button[title="${FOUNDRY_TEXTURE}"]`).click();
        await expect($("button*=Drop a PNG, JPG or WebP")).toBeEnabled();
        await expect(revert()).toBeEnabled();
        await revert().click();
        await expect(revert()).toBeDisabled();
      },
    );

    await assertFoundryDisk(world, "workspace-retried");
    await closeApplication(world, runtime.processId);
    await assertFoundryDisk(world, "workspace-closed");
  });
});
