import { $, $$, browser, expect } from "@wdio/globals";
import { startApplication } from "../support/application";
import { closeApplication } from "../support/application-exit";
import {
  createGroup,
  expectMembership,
  group,
  groupToggle,
  moveSelected,
  selectMods,
} from "../support/library-groups-actions";
import {
  PAGINATED_LAYOUT,
  PAGINATED_MODS,
} from "../support/library-groups-fixtures";
import { assertLibraryGroupsDisk } from "../support/library-groups-oracle";
import { navigate } from "../support/ui";

const cards = () => $$("[data-library-mod]");
const expectCards = async (ids: readonly string[]) => {
  await expect(cards()).toBeElementsArrayOfSize(ids.length);
  await browser.waitUntil(
    async () =>
      JSON.stringify(
        await cards().map((card) => card.getAttribute("data-library-mod")),
      ) === JSON.stringify(ids),
  );
};
const turnPage = async (name: "Next" | "Previous") => {
  await $(`nav[aria-label="pagination"] a[aria-label="${name}"]`).click();
};

describe("grouped pagination and filters", () => {
  it("keeps every mod reachable across pages, selection, collapsed search, and library tabs", async () => {
    const runtime = await startApplication();
    const world = runtime.roots.world;
    await navigate("my-mods");
    if (process.env.DMM_E2E_PHASE === "paginate") {
      await createGroup("Cosmetics");
      await selectMods([PAGINATED_MODS[0]]);
      await $("button=Select all 25").click();
      await expect($('[role="region"][aria-label="Select mods"]')).toHaveText(
        expect.stringContaining("25 mods selected"),
      );
      await moveSelected("Cosmetics");
      await $('button[aria-label="Done selecting"]').click();
      await expectCards(PAGINATED_MODS.slice(0, 20));
      await turnPage("Next");
      await expectCards(PAGINATED_MODS.slice(20));
      await expect(group("Cosmetics")).toHaveText(
        expect.stringContaining("5 of 25 on this page"),
      );
      await $('button[aria-label="List view"]').click();
      await expectCards(PAGINATED_MODS.slice(20));
      await groupToggle("Cosmetics").click();
      await expect(cards()).toBeElementsArrayOfSize(0);
      await $("#search").setValue("featured");
      await expectCards([PAGINATED_MODS[24]]);
      await expect(groupToggle("Cosmetics")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await $("#search").clearValue();
      await expect(groupToggle("Cosmetics")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await groupToggle("Cosmetics").click();
      await expectCards(PAGINATED_MODS.slice(0, 20));
      await $('button[role="tab"][id$="-trigger-enabled"]').click();
      await expectCards(PAGINATED_MODS.slice(0, 20));
      await $('button[role="tab"][id$="-trigger-disabled"]').click();
      await expect(cards()).toBeElementsArrayOfSize(0);
      await $('button[role="tab"][id$="-trigger-all"]').click();
      await expectCards(PAGINATED_MODS.slice(0, 20));
      const sort = $('button[role="combobox"]*=Install Order');
      await sort.click();
      await browser.keys("ArrowDown");
      await $('[role="option"]=Name').click();
      await expectCards(PAGINATED_MODS.toSorted().slice(0, 20));
      await turnPage("Next");
      await expectCards(PAGINATED_MODS.toSorted().slice(20));
    } else {
      await expectCards(PAGINATED_MODS.slice(0, 20));
      await expect(groupToggle("Cosmetics")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    await expectMembership(world, { Cosmetics: PAGINATED_MODS });
    await assertLibraryGroupsDisk(
      world,
      process.env.DMM_E2E_PHASE ?? "paginate",
      [],
      PAGINATED_LAYOUT,
    );
    await closeApplication(world, runtime.processId);
  });
});
