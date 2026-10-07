import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  CONFLICT_MODS,
  HAT_JACKET,
  HAT_PANTS,
  PANTS_TEXTURE,
} from "../support/conflict-fixtures";
import { assertConflictDisk, pairKey } from "../support/conflict-oracle";
import { step } from "../support/evidence";
import { navigate } from "../support/ui";

type ShownGroup = { providers: string; severity: string };

/** Providers are listed in load order, so this also asserts who is used in game. */
const shown = (severity: string, ...providers: string[]): ShownGroup => ({
  providers: providers.join(","),
  severity,
});

const group = (...providers: string[]) =>
  $(`[data-testid="conflict-group"][data-providers="${providers.join(",")}"]`);

const byProviders = (a: ShownGroup, b: ShownGroup) =>
  a.providers.localeCompare(b.providers);

const readGroups = async (): Promise<ShownGroup[]> =>
  (
    await $$('[data-testid="conflict-group"]').map(async (row) => ({
      providers: (await row.getAttribute("data-providers")) ?? "",
      severity: (await row.getAttribute("data-severity")) ?? "",
    }))
  ).toSorted(byProviders);

const expectGroups = (expected: ShownGroup[]) =>
  browser.waitUntil(
    async () =>
      JSON.stringify(await readGroups()) ===
      JSON.stringify(expected.toSorted(byProviders)),
    { timeoutMsg: `Conflicts never matched ${JSON.stringify(expected)}` },
  );

const openConflictsTab = () =>
  step("open conflicts tab", async () => {
    const tab = await $(
      '//*[@role="tab" and contains(normalize-space(), "Conflicts")]',
    );
    await tab.waitForClickable();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });

const sharedFiles = async (...providers: string[]) => {
  const row = await group(...providers);
  const toggle = await row.$('[data-testid="conflict-files-toggle"]');
  await toggle.click();
  const files = await row
    .$$('[data-testid="conflict-file"]')
    .map((file) => file.getAttribute("data-path"));
  await toggle.click();
  return files;
};

const RESOLVED = [HAT_PANTS, HAT_JACKET, PANTS_TEXTURE];

describe("mod conflicts", () => {
  it("detects, resolves, and ignores conflicts across process restart", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");

    if (process.env.DMM_E2E_PHASE === "resolve") {
      await assertConflictDisk(world, "initial-state", CONFLICT_MODS, null);

      await step("badge every conflicting mod", async () => {
        await browser.waitUntil(
          async () =>
            (await $$('[data-testid="mod-conflict-badge"]').length) ===
            CONFLICT_MODS.length,
          { timeoutMsg: "Every conflicting mod should carry a badge" },
        );
      });

      await openConflictsTab();
      await step("list the detected conflicts", async () => {
        // The identical jacket and the packer noise files are not conflicts,
        // so hat-jacket and pants-texture never share a group.
        await expectGroups([
          shown("critical", HAT_JACKET, HAT_PANTS),
          shown("normal", HAT_PANTS, PANTS_TEXTURE),
        ]);
        expect(await sharedFiles(HAT_JACKET, HAT_PANTS)).toEqual([
          "models/outfit/hat.vmdl_c",
        ]);
        expect(await sharedFiles(HAT_PANTS, PANTS_TEXTURE)).toEqual([
          "materials/outfit/pants.vmat_c",
        ]);
      });

      await step("load hat-pants first", async () => {
        await (
          await group(HAT_JACKET, HAT_PANTS)
        )
          .$(`[data-testid="conflict-provider"][data-mod-id="${HAT_PANTS}"]`)
          .$("button=Load first")
          .click();
        await expectGroups([
          shown("critical", HAT_PANTS, HAT_JACKET),
          shown("normal", HAT_PANTS, PANTS_TEXTURE),
        ]);
      });
      await assertConflictDisk(world, "reordered", RESOLVED, null);

      await step("mark the material overlap as fine", async () => {
        await (
          await group(HAT_PANTS, PANTS_TEXTURE)
        )
          .$("button=Mark as fine")
          .click();
        await expectGroups([shown("critical", HAT_PANTS, HAT_JACKET)]);
      });
      await assertConflictDisk(world, "ignored", RESOLVED, [
        pairKey(HAT_PANTS, PANTS_TEXTURE),
      ]);
    } else if (process.env.DMM_E2E_PHASE === "restart-conflicts") {
      await assertConflictDisk(world, "restarted", RESOLVED, [
        pairKey(HAT_PANTS, PANTS_TEXTURE),
      ]);
      await openConflictsTab();
      await step("keep the new order and the ignore", async () => {
        await expectGroups([shown("critical", HAT_PANTS, HAT_JACKET)]);
        await expect($("button*=Marked as fine (1)")).toBeDisplayed();
      });

      await step("restore ignored conflicts", async () => {
        await $("button=Restore all").click();
        await expectGroups([
          shown("critical", HAT_PANTS, HAT_JACKET),
          shown("normal", HAT_PANTS, PANTS_TEXTURE),
        ]);
      });
      await assertConflictDisk(world, "restored", RESOLVED, []);
    } else throw new Error("Unknown conflicts phase");

    await closeApplication(world, runtime.processId);
    await assertConflictDisk(
      world,
      `closed-${process.env.DMM_E2E_PHASE}`,
      RESOLVED,
      process.env.DMM_E2E_PHASE === "resolve"
        ? [pairKey(HAT_PANTS, PANTS_TEXTURE)]
        : [],
    );
  });
});
