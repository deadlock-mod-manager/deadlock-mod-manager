import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  applyInstalledFiles,
  closeCatalogOptions,
  openCatalogOptions,
} from "../support/catalog-actions";
import { step } from "../support/evidence";
import {
  assertPartsDisk,
  EXTRA_PART,
  PART_FILES,
  PARTS_MOD_NAME,
  readPartsState,
} from "../support/local-parts-fixtures";
import { observeUntil } from "../support/observations";
import {
  installedFiles,
  navigate,
  openAddLocalMod,
  waitForDisplayed,
} from "../support/ui";

const checkpointSchema = z.object({ processId: z.number() });
const [BASE, HAIR, SOUNDS] = PART_FILES;
const DROP_SELECTOR =
  '[role="button"][aria-label="Drop files/folders here, or click to select"]';

const waitForStatus = (world: string, status: string) =>
  observeUntil(
    `Parts mod did not reach ${status}`,
    () => readPartsState(world),
    (state) => state.localMods[0]?.status === status,
  );

const listedParts = () =>
  $$('[data-testid="mod-parts"] [data-part-name]').map((row) =>
    row.getAttribute("data-part-name"),
  );

const openPartsMod = async () => {
  await navigate("my-mods");
  await waitForDisplayed(`[title="${PARTS_MOD_NAME}"]`);
  await $(`[title="${PARTS_MOD_NAME}"]`).click();
  await waitForDisplayed("button=Manage files");
};

describe("local mod parts", () => {
  it("imports several VPKs as one mod whose parts toggle in Manage files", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpointPath = path.join(
      world,
      "artifacts",
      "parts-checkpoint.json",
    );

    if (process.env.DMM_E2E_PHASE === "import-toggle") {
      await step("drop four VPKs and drop one part", async () => {
        await navigate("my-mods");
        await openAddLocalMod();
        const dropArea = await $(DROP_SELECTOR);
        await dropArea.waitForClickable();
        await browser.execute(
          (selector: string, uris: string) => {
            const transfer = new DataTransfer();
            transfer.setData("text/uri-list", uris);
            document.querySelector(selector)?.dispatchEvent(
              new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer: transfer,
              }),
            );
          },
          DROP_SELECTOR,
          [EXTRA_PART, ...PART_FILES]
            .map(
              (name) => pathToFileURL(path.join(world, "fixtures", name)).href,
            )
            .join("\r\n"),
        );
        await browser.waitUntil(
          async () => (await listedParts()).length === 4,
          {
            timeoutMsg: "The finalize dialog did not list the dropped parts",
          },
        );
        // Listed in install order, whatever order they were dropped in.
        expect(await listedParts()).toEqual([BASE, EXTRA_PART, HAIR, SOUNDS]);
        await $(`button[aria-label="Remove ${EXTRA_PART}"]`).click();
        await browser.waitUntil(
          async () => (await listedParts()).length === 3,
          {
            timeoutMsg: "Removing a part did not drop it from the list",
          },
        );
        expect(await listedParts()).toEqual([...PART_FILES]);
      });

      await step("add the parts as one mod", async () => {
        const add = await $('[role="dialog"]').$("button=Add");
        await add.waitForClickable();
        await add.click();
        await waitForStatus(world, "downloaded");
        await assertPartsDisk(world, "imported", "downloaded", []);
      });

      await step("enabling installs every part", async () => {
        await navigate("my-mods");
        await waitForDisplayed(`[title="${PARTS_MOD_NAME}"]`);
        const toggle = await $('[role="switch"]');
        await toggle.waitForClickable();
        await toggle.click();
        await waitForStatus(world, "installed");
        await expect($('[role="dialog"]')).not.toBeDisplayed();
        await assertPartsDisk(world, "enabled", "installed", PART_FILES);
      });

      await openPartsMod();
      await applyInstalledFiles([BASE, SOUNDS], PARTS_MOD_NAME);
      await assertPartsDisk(world, "hair-off", "installed", [BASE, SOUNDS]);
      await writeFile(
        checkpointPath,
        JSON.stringify({ processId: runtime.processId }),
      );
    } else if (process.env.DMM_E2E_PHASE === "restart") {
      const checkpoint = checkpointSchema.parse(
        JSON.parse(await readFile(checkpointPath, "utf8")),
      );
      expect(runtime.processId).not.toBe(checkpoint.processId);
      await waitForStatus(world, "installed");
      await assertPartsDisk(world, "restarted", "installed", [BASE, SOUNDS]);

      await openPartsMod();
      await step("Manage files keeps the selection", async () => {
        await openCatalogOptions(PARTS_MOD_NAME);
        const rows = await installedFiles().$$("[data-selected]");
        const selection = await rows.map(async (row) => [
          await row.$("[data-file-name]").getText(),
          await row.getAttribute("data-selected"),
        ]);
        expect(selection).toEqual(
          PART_FILES.map((name) => [name, String(name !== HAIR)]),
        );
        await closeCatalogOptions();
      });
      await applyInstalledFiles([...PART_FILES], PARTS_MOD_NAME);
      await assertPartsDisk(world, "hair-on", "installed", PART_FILES);
    } else {
      throw new Error(`Unknown phase ${process.env.DMM_E2E_PHASE}`);
    }
    await closeApplication(world, runtime.processId);
  });
});
