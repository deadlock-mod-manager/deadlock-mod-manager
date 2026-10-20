import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  expectGroupOrder,
  expectMembership,
  group,
  groupHeader,
  groupToggle,
  nativeGroupDrag,
  selectMods,
} from "../support/library-groups-actions";
import { assertLibraryGroupsDisk } from "../support/library-groups-oracle";
import { ALPHA_MODS } from "../support/profile-fixtures";
import { navigate } from "../support/ui";

const mod = (id: string) =>
  $(`[data-library-mod="${id}"]`).$(`[title="${id}"], h3`);

describe("native library group dragging", () => {
  it("moves selected mods, supports undo and hover expansion, and reorders folders independently", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    const [first, second, third] = ALPHA_MODS;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "drag") {
      await createGroup("Characters");
      await createGroup("Maps");
      await groupToggle("Characters").click();
      await selectMods([first, third]);
      await nativeGroupDrag(
        mod(first),
        () => groupHeader("Characters"),
        async () => {
          await expect(groupToggle("Characters")).toHaveAttribute(
            "aria-expanded",
            "true",
          );
          await expect($("[data-library-drag-preview]")).toHaveText(
            expect.stringContaining("2 mods"),
          );
        },
      );
      await expectMembership(world, { Characters: [first, third], Maps: [] });
      await $("button=Undo").click();
      await expectMembership(world, { Characters: [], Maps: [] });
      await nativeGroupDrag(mod(first), () =>
        group("Characters").$("[data-mod-group-drop]"),
      );
      await expectMembership(world, { Characters: [first, third], Maps: [] });
      await $('button[aria-label="Done selecting"]').click();
      await nativeGroupDrag($('button[aria-label="Reorder Maps"]'), () =>
        groupHeader("Characters"),
      );
      await expectGroupOrder(["Maps", "Characters"]);
      await $('button[aria-label="List view"]').click();
      await nativeGroupDrag(mod(second), () =>
        group("Maps").$("[data-mod-group-drop]"),
      );
      await expectMembership(world, {
        Maps: [second],
        Characters: [first, third],
      });
      await nativeGroupDrag(mod(second), () => $("button=New group"));
    }
    await expectMembership(world, {
      Maps: [second],
      Characters: [first, third],
    });
    await expectGroupOrder(["Maps", "Characters"]);
    await assertLibraryGroupsDisk(world, process.env.DMM_E2E_PHASE ?? "drag");
    await browser.saveScreenshot(
      path.join(world, "artifacts", `${process.env.DMM_E2E_PHASE}.png`),
    );
    await closeApplication(world, runtime.processId);
  });
});
