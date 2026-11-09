import { describe, expect, it } from "bun:test";
import { createInstance } from "i18next";
import type { CatalogCategory } from "@/types/generated/CatalogCategory";
import {
  broadCategoryLabel,
  buildCategoryTree,
  catalogCategoryLabel,
  flattenCategoryTree,
  normalizeCategorySelection,
  selectedCategoryLabel,
  selectedCategoryPathLabel,
  toggleCatalogCategory,
  WORLD_CATEGORY_KEY,
} from "./catalog-categories";

const world: CatalogCategory = {
  key: WORLD_CATEGORY_KEY,
  name: "Model Replacement",
};
const npcs: CatalogCategory = { key: "mod:44691", name: "NPCs" };
const walker: CatalogCategory = { key: "mod:44458", name: "Walker" };
const guardian: CatalogCategory = { key: "mod:44688", name: "Guardian" };
const urn: CatalogCategory = { key: "mod:41656", name: "Spirit Urn" };
const sinners: CatalogCategory = {
  key: "mod:44391",
  name: "Sinner's Sacrifice",
};
const paths = [
  [world, npcs, walker],
  [world, npcs, guardian],
  [world, urn],
  [world, sinners],
];

describe("catalog category options", () => {
  it("selects World through its broad category so unclassified submissions stay included", () => {
    expect(
      toggleCatalogCategory(world.key, ["Skins"], [walker.key], paths),
    ).toEqual({
      categories: ["Skins", "Model Replacement"],
      keys: [],
    });
    expect(
      toggleCatalogCategory(
        world.key,
        ["Model Replacement", "Skins"],
        [world.key, walker.key],
        paths,
      ),
    ).toEqual({ categories: ["Skins"], keys: [] });
    expect(toggleCatalogCategory(world.key, [], [world.key], paths)).toEqual({
      categories: [],
      keys: [],
    });
  });

  it("keeps siblings and unrelated broad categories when toggling a child", () => {
    expect(
      toggleCatalogCategory(walker.key, ["Skins"], [guardian.key], paths),
    ).toEqual({ categories: ["Skins"], keys: [guardian.key, walker.key] });
    expect(
      toggleCatalogCategory(
        walker.key,
        ["Skins"],
        [guardian.key, walker.key],
        paths,
      ),
    ).toEqual({ categories: ["Skins"], keys: [guardian.key] });
  });

  it("narrows All World to Sinner's Sacrifice instead of including every World mod", () => {
    expect(
      toggleCatalogCategory(sinners.key, ["Model Replacement"], [], paths),
    ).toEqual({
      categories: [],
      keys: [sinners.key],
    });
    expect(toggleCatalogCategory(sinners.key, [], [world.key], paths)).toEqual({
      categories: [],
      keys: [sinners.key],
    });
  });

  it("replaces ancestors with children and children with an explicit All selection", () => {
    expect(
      toggleCatalogCategory(
        walker.key,
        ["Model Replacement", "Skins"],
        [npcs.key, urn.key],
        paths,
      ),
    ).toEqual({
      categories: ["Skins"],
      keys: [urn.key, walker.key],
    });
    expect(
      toggleCatalogCategory(
        npcs.key,
        ["Skins"],
        [walker.key, guardian.key, urn.key],
        paths,
      ),
    ).toEqual({
      categories: ["Skins"],
      keys: [urn.key, npcs.key],
    });
  });

  it("does not restore a broader parent when the last child is removed", () => {
    expect(
      toggleCatalogCategory(sinners.key, [], [sinners.key], paths),
    ).toEqual({
      categories: [],
      keys: [],
    });
  });

  it("repairs saved overlapping selections before querying or displaying chips", () => {
    expect(
      normalizeCategorySelection(
        ["Model Replacement", "Skins"],
        [world.key, npcs.key, walker.key, walker.key, urn.key],
        paths,
      ),
    ).toEqual({
      categories: ["Skins"],
      keys: [walker.key, urn.key],
    });
    expect(
      normalizeCategorySelection(["Model Replacement"], [sinners.key], paths),
    ).toEqual({
      categories: [],
      keys: [sinners.key],
    });
    expect(normalizeCategorySelection([], [world.key], paths)).toEqual({
      categories: ["Model Replacement"],
      keys: [],
    });
    expect(
      normalizeCategorySelection(["Model Replacement"], [], paths),
    ).toEqual({
      categories: ["Model Replacement"],
      keys: [],
    });
  });

  it("preserves selections while taxonomy is unavailable or a key is unknown", () => {
    expect(
      normalizeCategorySelection(["Skins"], [walker.key, "mod:99999"], []),
    ).toEqual({
      categories: ["Skins"],
      keys: [walker.key, "mod:99999"],
    });
  });

  it("deduplicates paths and keeps matching numeric IDs in other submission types separate", () => {
    const tree = buildCategoryTree([
      ...paths,
      paths[0],
      [{ key: "sound:33154", name: "Sounds" }],
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[1].category.key).toBe("sound:33154");
    expect(tree[0].children.map((node) => node.category.key)).toEqual([
      npcs.key,
      urn.key,
      sinners.key,
    ]);
    expect(
      tree[0].children[0].children.map((node) => node.category.key),
    ).toEqual([walker.key, guardian.key]);
  });

  it("supports every root and nested branch across Mods, Sounds, and WiPs", () => {
    const skins = { key: "mod:10", name: "Skins" };
    const infernus = { key: "mod:11", name: "Infernus" };
    const music = { key: "sound:10", name: "Music" };
    const combat = { key: "sound:11", name: "Combat" };
    const wips = { key: "wip:10", name: "Gameplay Modifications" };
    const practice = { key: "wip:11", name: "Practice" };
    const allPaths = [
      ...paths,
      [skins, infernus],
      [music, combat],
      [wips, practice],
    ];
    expect(
      buildCategoryTree(allPaths).map(({ category }) => category.key),
    ).toEqual([world.key, skins.key, music.key, wips.key]);
    for (const [root, child] of [
      [skins, infernus],
      [music, combat],
      [wips, practice],
    ]) {
      expect(toggleCatalogCategory(root.key, [], [], allPaths)).toEqual({
        categories: [root.name],
        keys: [],
      });
      expect(
        toggleCatalogCategory(child.key, [root.name], [], allPaths),
      ).toEqual({ categories: [], keys: [child.key] });
      expect(
        toggleCatalogCategory(root.key, [], [child.key], allPaths),
      ).toEqual({ categories: [root.name], keys: [] });
      expect(
        normalizeCategorySelection(
          [root.name],
          [root.key, child.key],
          allPaths,
        ),
      ).toEqual({ categories: [], keys: [child.key] });
    }
    expect(
      toggleCatalogCategory(
        infernus.key,
        ["Model Replacement", "Skins"],
        [walker.key],
        allPaths,
      ),
    ).toEqual({
      categories: ["Model Replacement"],
      keys: [walker.key, infernus.key],
    });
  });

  it("shows provider-defined roots and narrows the broad Other catch-all", () => {
    const customRoot = { key: "mod:900", name: "New source category" };
    const customChild = { key: "mod:901", name: "Nested source category" };
    const miscRoot = { key: "mod:902", name: "Other/Misc" };
    const allPaths = [[customRoot, customChild], [miscRoot]];
    expect(buildCategoryTree(allPaths)).toHaveLength(2);
    expect(
      toggleCatalogCategory(customChild.key, ["Other/Misc"], [], allPaths),
    ).toEqual({ categories: [], keys: [customChild.key] });
    expect(
      toggleCatalogCategory(customRoot.key, ["Other/Misc"], [], allPaths),
    ).toEqual({ categories: [customRoot.name], keys: [] });
    expect(toggleCatalogCategory(miscRoot.key, [], [], allPaths)).toEqual({
      categories: [],
      keys: [miscRoot.key],
    });
    expect(
      normalizeCategorySelection(["Other/Misc"], [customChild.key], allPaths),
    ).toEqual({ categories: [], keys: [customChild.key] });
    expect(
      normalizeCategorySelection(["Other/Misc"], [customRoot.key], allPaths),
    ).toEqual({ categories: [customRoot.name], keys: [] });
    expect(
      normalizeCategorySelection(["Other/Misc"], [miscRoot.key], allPaths),
    ).toEqual({ categories: [], keys: [miscRoot.key] });
  });

  it("provides complete paths for drill-down navigation and global search", () => {
    const options = flattenCategoryTree(buildCategoryTree(paths));
    expect(
      options.map(({ path }) => path.map((category) => category.key)),
    ).toEqual([
      [world.key],
      [world.key, npcs.key],
      [world.key, npcs.key, walker.key],
      [world.key, npcs.key, guardian.key],
      [world.key, urn.key],
      [world.key, sinners.key],
    ]);
    expect(
      options
        .find(({ node }) => node.category.key === npcs.key)
        ?.node.children.map(({ category }) => category.key),
    ).toEqual([walker.key, guardian.key]);
  });

  it("uses the richest ancestry when sparse and complete paths coexist", () => {
    for (const mixedPaths of [
      [
        [world, walker],
        [world, npcs, walker],
      ],
      [
        [world, npcs, walker],
        [world, walker],
      ],
    ]) {
      const rows = flattenCategoryTree(buildCategoryTree(mixedPaths));
      expect(
        rows.map((row) => [row.node.category.key, row.path.length - 1]),
      ).toEqual([
        [world.key, 0],
        [npcs.key, 1],
        [walker.key, 2],
      ]);
    }
  });

  it("labels known selections offline and preserves unknown source names", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: {
        en: {
          translation: {
            filters: { worldCategories: { world: "World", walker: "Walker" } },
          },
        },
      },
    });
    expect(selectedCategoryLabel(walker.key, [], i18n.t)).toBe("Walker");
    expect(selectedCategoryPathLabel(walker.key, paths, i18n.t)).toBe(
      "World / NPCs / Walker",
    );
    expect(selectedCategoryPathLabel(npcs.key, paths, i18n.t)).toBe(
      "World / NPCs",
    );
    expect(
      selectedCategoryPathLabel(
        walker.key,
        [[world, walker], ...paths],
        i18n.t,
      ),
    ).toBe("World / NPCs / Walker");
    expect(selectedCategoryLabel("mod:99999", [], i18n.t)).toBe("mod:99999");
    expect(
      catalogCategoryLabel(
        { key: "mod:99999", name: "New World Category" },
        i18n.t,
      ),
    ).toBe("New World Category");
    expect(broadCategoryLabel("Model Replacement", true, i18n.t)).toBe("World");
    expect(broadCategoryLabel("Model Replacement", false, i18n.t)).toBe(
      "Models",
    );
  });
});
