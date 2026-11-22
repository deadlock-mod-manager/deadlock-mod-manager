import type { TFunction } from "i18next";
import {
  getModCategoryDisplayName,
  getModCategoryLabelKey,
  ModCategory,
} from "@/lib/constants";
import type { CatalogCategory } from "@/types/generated/CatalogCategory";

export const WORLD_CATEGORY_KEY = "mod:33154";

export interface CatalogCategorySelection {
  paths: CatalogCategory[][];
  selectedKeys: string[];
  selectedHeroes: string[];
  onSelectionChange: (selection: CatalogFilterSelection) => void;
}

export interface CategorySelection {
  categories: string[];
  keys: string[];
}

export interface CatalogFilterSelection extends CategorySelection {
  heroes: string[];
}

export interface CategoryTreeNode {
  category: CatalogCategory;
  children: CategoryTreeNode[];
}

export const toggleCatalogCategory = (
  key: string,
  categories: string[],
  keys: string[],
  paths: CatalogCategory[][],
): CategorySelection => {
  const path = categoryPathForKey(key, paths);
  const root = path?.[0];
  const broadCategory = rootCategoryName(key, paths);
  if (broadCategory) {
    // Broad roots also include submissions whose detailed taxonomy is still syncing.
    const selected = categories.includes(broadCategory) || keys.includes(key);
    return {
      categories: selected
        ? categories.filter((category) => category !== broadCategory)
        : [
            ...categories.filter(
              (category) => !broadCategoryCovers(category, broadCategory),
            ),
            broadCategory,
          ],
      keys: keys.filter(
        (entry) => entry !== key && !isCategoryAncestor(key, entry, paths),
      ),
    };
  }
  const selected = keys.includes(key);
  return {
    categories: selected
      ? categories
      : categories.filter(
          (category) => !root || !broadCategoryCovers(category, root.name),
        ),
    keys: selected
      ? keys.filter((entry) => entry !== key)
      : [
          ...keys.filter(
            (entry) =>
              !isCategoryAncestor(entry, key, paths) &&
              !isCategoryAncestor(key, entry, paths),
          ),
          key,
        ],
  };
};

const broadCategoryCovers = (category: string, rootName: string) => {
  const predefined: string[] = Object.values(ModCategory);
  return (
    category === rootName ||
    (category === ModCategory.OTHER_MISC && !predefined.includes(rootName))
  );
};

export const categoryPathForKey = (key: string, paths: CatalogCategory[][]) =>
  paths.reduce<CatalogCategory[] | undefined>((longest, entries) => {
    const index = entries.findIndex((entry) => entry.key === key);
    return index >= 0 && index + 1 > (longest?.length ?? 0)
      ? entries.slice(0, index + 1)
      : longest;
  }, undefined);

/** Other/Misc is a broad catch-all in SQL, so its taxonomy root uses its scoped key. */
export const rootCategoryName = (key: string, paths: CatalogCategory[][]) => {
  const path = categoryPathForKey(key, paths);
  if (path?.length === 1 && path[0].name !== ModCategory.OTHER_MISC)
    return path[0].name;
  return key === WORLD_CATEGORY_KEY && !path
    ? ModCategory.MODEL_REPLACEMENT
    : undefined;
};

const isCategoryAncestor = (
  ancestor: string,
  descendant: string,
  paths: CatalogCategory[][],
) =>
  paths.some((path) => {
    const ancestorIndex = path.findIndex((entry) => entry.key === ancestor);
    return (
      ancestorIndex >= 0 &&
      path.findIndex((entry) => entry.key === descendant) > ancestorIndex
    );
  });

/** Repair overlapping saved selections by keeping their most specific filters. */
export const normalizeCategorySelection = (
  categories: string[],
  keys: string[],
  paths: CatalogCategory[][],
): CategorySelection => {
  const uniqueKeys = [...new Set(keys)];
  const specificKeys = uniqueKeys.filter(
    (key) => !uniqueKeys.some((other) => isCategoryAncestor(key, other, paths)),
  );
  const broadCategories = categories.filter(
    (category) =>
      !specificKeys.some((key) => {
        const path = categoryPathForKey(key, paths);
        return (
          path &&
          (path.length > 1 || category !== rootCategoryName(key, paths)) &&
          broadCategoryCovers(category, path[0].name)
        );
      }),
  );
  const normalizedKeys: string[] = [];
  for (const key of specificKeys) {
    const category = rootCategoryName(key, paths);
    if (!category) normalizedKeys.push(key);
    else if (!broadCategories.includes(category))
      broadCategories.push(category);
  }
  return {
    categories: broadCategories,
    keys: normalizedKeys,
  };
};

const WORLD_LABELS = new Map([
  ["mod:33154", "world"],
  ["mod:44699", "activeItems"],
  ["mod:41651", "breakables"],
  ["mod:44206", "hideout"],
  ["mod:44691", "npcs"],
  ["mod:45979", "rejuvenator"],
  ["mod:44391", "sinnersSacrifice"],
  ["mod:41868", "soulContainer"],
  ["mod:41656", "spiritUrn"],
  ["mod:44688", "guardian"],
  ["mod:44690", "haunts"],
  ["mod:44686", "midboss"],
  ["mod:45181", "patrons"],
  ["mod:46849", "sandboxDummy"],
  ["mod:44687", "troopers"],
  ["mod:44458", "walker"],
]);

export const catalogCategoryLabel = (
  category: CatalogCategory,
  t: TFunction,
) => {
  const labelKey = WORLD_LABELS.get(category.key);
  if (labelKey)
    return t(`filters.worldCategories.${labelKey}`, {
      defaultValue: category.name,
    });
  const broadLabelKey = getModCategoryLabelKey(category.name);
  return broadLabelKey
    ? t(`modCategories.${broadLabelKey}`, { defaultValue: category.name })
    : category.name;
};

export const broadCategoryLabel = (
  category: string,
  world: boolean,
  t: TFunction,
) => {
  if (world && category === ModCategory.MODEL_REPLACEMENT)
    return t("filters.worldCategories.world");
  const key = getModCategoryLabelKey(category);
  return key
    ? t(`modCategories.${key}`, {
        defaultValue: getModCategoryDisplayName(category),
      })
    : getModCategoryDisplayName(category);
};

export const selectedCategoryLabel = (
  key: string,
  paths: CatalogCategory[][],
  t: TFunction,
) => {
  const category = paths.flat().find((entry) => entry.key === key);
  if (category) return catalogCategoryLabel(category, t);
  return catalogCategoryLabel({ key, name: key }, t);
};

export const selectedCategoryPathLabel = (
  key: string,
  paths: CatalogCategory[][],
  t: TFunction,
) => {
  const path = categoryPathForKey(key, paths);
  if (!path) return selectedCategoryLabel(key, paths, t);
  return path.map((category) => catalogCategoryLabel(category, t)).join(" / ");
};

/** Scoped keys keep identities separate across submission types. */
export const buildCategoryTree = (paths: CatalogCategory[][]) => {
  const ancestry = new Map<
    string,
    { node: CategoryTreeNode; parent: CategoryTreeNode | null; depth: number }
  >();
  for (const path of paths) {
    let parent: CategoryTreeNode | null = null;
    for (const [depth, category] of path.entries()) {
      // A partial sync can contain both root/leaf and fully resolved paths.
      // Keep each identity once, under its richest known ancestry.
      let entry = ancestry.get(category.key);
      if (!entry) {
        entry = { node: { category, children: [] }, parent, depth };
        ancestry.set(category.key, entry);
      } else if (depth > entry.depth) {
        entry.parent = parent;
        entry.depth = depth;
        entry.node.category = category;
      }
      parent = entry.node;
    }
  }
  const roots: CategoryTreeNode[] = [];
  for (const { node, parent } of ancestry.values()) {
    if (parent === null) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
};

export interface CategoryOption {
  node: CategoryTreeNode;
  path: CatalogCategory[];
}

export const flattenCategoryTree = (
  nodes: CategoryTreeNode[],
): CategoryOption[] => {
  const rows: CategoryOption[] = [];
  const visit = (entries: CategoryTreeNode[], ancestors: CatalogCategory[]) => {
    for (const node of entries) {
      const path = [...ancestors, node.category];
      rows.push({ node, path });
      visit(node.children, path);
    }
  };
  visit(nodes, []);
  return rows;
};
