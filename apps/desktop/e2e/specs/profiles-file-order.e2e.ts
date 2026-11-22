import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { z } from "zod";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import { step } from "../support/evidence";
import { MULTI, SOLO } from "../support/file-order-fixtures";
import {
  assertFileOrderDisk,
  readFileOrderStore,
} from "../support/file-order-oracle";
import { observeUntil } from "../support/observations";
import { setModEnabled } from "../support/shard-actions";
import { navigate, openOrdering } from "../support/ui";

const [first, second] = MULTI.files;
const initial = [first, second, SOLO.file];
const reordered = [SOLO.file, second, first];

const dialog = () => $('[role="dialog"]');
const showFiles = async () => {
  const toggle = await dialog().$(
    `[data-mod-row="${MULTI.id}"] button[aria-expanded]`,
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
};
const listedFiles = () =>
  dialog()
    .$(`[role="group"][aria-label="Files of ${MULTI.id}"]`)
    .$$("li p.font-mono")
    .map((element) => element.getText());
// dnd-kit's keyboard sensor: Space picks the item up, an arrow moves it one
// place, Space drops it.
const moveWithKeyboard = async (name: string, key: "ArrowUp" | "ArrowDown") => {
  const handle = await dialog().$(`button[aria-label="Reorder ${name}"]`);
  await handle.click();
  await expect(handle).toBeFocused();
  await browser.keys(" ");
  await browser.keys(key);
  await browser.keys(" ");
};

describe("profile file order", () => {
  it("renames VPKs inside a mod and keeps tracking them", async () => {
    const phase = z
      .enum(["reorder-files", "restart-file-order"])
      .parse(process.env.DMM_E2E_PHASE);
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const checkpoint = path.join(world, "artifacts", "file-order-process.json");
    await navigate("my-mods");
    if (phase === "reorder-files") {
      await step("initial layout", () =>
        assertFileOrderDisk(world, "initial", initial),
      );
      await openOrdering();
      await showFiles();
      expect(await listedFiles()).toEqual([first, second]);
      await step("move a file and a mod", async () => {
        await moveWithKeyboard(first, "ArrowDown");
        expect(await listedFiles()).toEqual([second, first]);
        await expect(dialog().$("button=Use author order")).toBeDisplayed();
        await moveWithKeyboard(SOLO.id, "ArrowUp");
        await dialog().$("button=Save").click();
        await expect(dialog()).not.toBeDisplayed();
        await observeUntil(
          "the saved order reached the library",
          () => readFileOrderStore(world),
          (state) =>
            state.localMods.find((mod) => mod.remoteId === SOLO.id)
              ?.installOrder === 0,
        );
      });
      await step("reordered layout", () =>
        assertFileOrderDisk(world, "reordered", reordered),
      );
      for (const enabled of [false, true])
        await setModEnabled(world, MULTI.id, enabled);
      await step("re-enabled layout", () =>
        assertFileOrderDisk(world, "reenabled", reordered),
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
      await step("fresh process layout", () =>
        assertFileOrderDisk(world, "restarted", reordered),
      );
      await openOrdering();
      await showFiles();
      expect(await listedFiles()).toEqual([second, first]);
      await browser.keys("Escape");
    }
    await closeApplication(world, runtime.processId);
    await assertFileOrderDisk(world, `closed-${phase}`, reordered);
  });
});
