import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import {
  assertFoundryDisk,
  FOUNDRY_MOD_NAME,
  FOUNDRY_TEXTURE,
  foundryStagedSource,
  foundryTextureBytes,
  foundryWorkspaceRoot,
  readFoundryJournals,
} from "../support/foundry-fixtures";
import { observeUntil } from "../support/observations";

describe("Foundry revert failure", () => {
  it("preserves painted bytes and journals until the original can be read", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await step("open the synthetic texture-only Kelvin skin", async () => {
      await $('a[href="/foundry"]').click();
      await $('button[role="tab"]*=Installed skins').click();
      await $(`//button[.//*[@title="${FOUNDRY_MOD_NAME}"]]`).click();
      await expect($("button=Export VPK")).toBeEnabled();
    });
    const root = await foundryWorkspaceRoot(world);
    const texturePath = path.join(root, "files", FOUNDRY_TEXTURE);
    await step(
      "paint the body and confirm the edited texture and both journals",
      async () => {
        await $('button[role="tab"]*=Paint').click();
        await $(
          '//button[@aria-pressed and .//span[normalize-space()="Body"]]',
        ).click();
        await expect($("button=Paint Body")).toBeEnabled();
        await $("button=Paint Body").click();
        await observeUntil(
          "Paint is recorded in both journals",
          () => readFoundryJournals(root),
          (journals) =>
            journals.edits.includes(FOUNDRY_TEXTURE) &&
            journals.paint.some((entry) => entry.entryPath === FOUNDRY_TEXTURE),
        );
        assert.notDeepEqual(await readFile(texturePath), foundryTextureBytes());
        await $('button[role="tab"]*=Assets').click();
        await $(`button[title="${FOUNDRY_TEXTURE}"]`).click();
        await expect($("button=Revert to original")).toBeEnabled();
      },
    );
    const editedBytes = await readFile(texturePath);
    const edits = await readFile(path.join(root, "edits.json"));
    const paint = await readFile(path.join(root, "paint.json"));
    const source = await foundryStagedSource(world);
    const originalVpk = await readFile(source);
    try {
      await step(
        "corrupt the staged source and fail Revert to original",
        async () => {
          await writeFile(source, "E2E corrupt source VPK");
          await $("button=Revert to original").click();
          await expect($('[data-sonner-toast][data-type="error"]')).toHaveText(
            expect.stringContaining("Couldn't revert that file."),
          );
          assert.deepEqual(
            await readFile(texturePath),
            editedBytes,
            "A failed revert must keep the edit",
          );
          assert.deepEqual(
            await readFile(path.join(root, "edits.json")),
            edits,
          );
          assert.deepEqual(
            await readFile(path.join(root, "paint.json")),
            paint,
          );
          await expect($("button=Revert to original")).toBeEnabled();
        },
      );
    } finally {
      await writeFile(source, originalVpk);
    }
    await step("restore the source and retry the revert", async () => {
      await $("button=Revert to original").click();
      // The button is disabled while the revert runs; the toast marks its end.
      await expect($('[data-sonner-toast][data-type="success"]')).toHaveText(
        expect.stringContaining("Reverted"),
      );
      await assertFoundryDisk(world, "revert-restored");
    });
    await closeApplication(world, runtime.processId);
    await assertFoundryDisk(world, "revert-closed");
  });
});
