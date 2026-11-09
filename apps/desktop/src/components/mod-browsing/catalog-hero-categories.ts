import { normalizeHero, SKINS_SUPER_CATEGORY } from "@deadlock-mods/shared";
import type { CatalogCategory } from "@/types/generated/CatalogCategory";
import {
  categoryPathForKey,
  type CatalogFilterSelection,
  normalizeCategorySelection,
  toggleCatalogCategory,
} from "./catalog-categories";

/** Only a direct child of a Skins root represents a hero; NPC and style names do not. */
export const heroCategoryForKey = (key: string, paths: CatalogCategory[][]) => {
  const path = categoryPathForKey(key, paths);
  const root = path?.[0];
  const heroCategory = path?.[1];
  if (!root || !heroCategory || root.name !== SKINS_SUPER_CATEGORY) return null;
  const kind = root.key.startsWith("mod:")
    ? "mod:"
    : root.key.startsWith("wip:")
      ? "wip:"
      : null;
  if (!kind || !path.every((category) => category.key.startsWith(kind)))
    return null;
  const hero = normalizeHero(heroCategory.name);
  return hero ? { hero, root, category: heroCategory } : null;
};

export const normalizeCatalogFilterSelection = (
  selection: CatalogFilterSelection,
  paths: CatalogCategory[][],
): CatalogFilterSelection => {
  const normalized = normalizeCategorySelection(
    selection.categories,
    selection.keys,
    paths,
  );
  const heroes = new Set(selection.heroes);
  const categories = new Set(normalized.categories);
  const hasSkinType = normalized.keys.some(
    (key) =>
      categoryPathForKey(key, paths)?.[0]?.name === SKINS_SUPER_CATEGORY &&
      heroCategoryForKey(key, paths)?.category.key !== key,
  );
  const keys = normalized.keys.filter((key) => {
    const linked = heroCategoryForKey(key, paths);
    if (!linked) return true;
    heroes.add(linked.hero);
    if (key !== linked.category.key || hasSkinType) return true;
    categories.add(linked.root.name);
    return false;
  });
  return {
    ...normalizeCategorySelection([...categories], keys, paths),
    heroes: [...heroes],
  };
};

export const toggleCatalogFilterCategory = (
  key: string,
  selection: CatalogFilterSelection,
  paths: CatalogCategory[][],
): CatalogFilterSelection => {
  const linked = heroCategoryForKey(key, paths);
  const branchKeys = new Set(selection.keys);
  if (linked && selection.categories.includes(linked.root.name)) {
    const heroKeys = skinHeroCategoryKeys(paths);
    for (const hero of selection.heroes) {
      const heroKey = heroKeys.get(hero);
      if (heroKey) branchKeys.add(heroKey);
    }
  }
  if (linked && key === linked.category.key) {
    const selected =
      selection.keys.includes(key) ||
      (selection.categories.includes(linked.root.name) &&
        selection.heroes.includes(linked.hero));
    const next = toggleCatalogCategory(
      key,
      selection.categories.filter((category) => category !== linked.root.name),
      [...branchKeys],
      paths,
    );
    if (
      !next.keys.some(
        (entry) =>
          categoryPathForKey(entry, paths)?.[0]?.key === linked.root.key,
      )
    )
      next.categories.push(linked.root.name);
    return normalizeCatalogFilterSelection(
      {
        ...next,
        heroes: selected
          ? selection.heroes.filter((hero) => hero !== linked.hero)
          : [...new Set([...selection.heroes, linked.hero])],
      },
      paths,
    );
  }
  const adding = !selection.keys.includes(key);
  const next = {
    ...toggleCatalogCategory(key, selection.categories, [...branchKeys], paths),
    heroes:
      linked && adding
        ? [...new Set([...selection.heroes, linked.hero])]
        : selection.heroes,
  };
  if (linked && !adding) {
    const remainingSkinKeys = next.keys.filter(
      (entry) => categoryPathForKey(entry, paths)?.[0]?.key === linked.root.key,
    );
    if (
      remainingSkinKeys.length > 0 &&
      !remainingSkinKeys.some(
        (entry) => heroCategoryForKey(entry, paths)?.hero === linked.hero,
      )
    ) {
      next.heroes = next.heroes.filter((hero) => hero !== linked.hero);
    }
  }
  return normalizeCatalogFilterSelection(next, paths);
};

const skinHeroCategoryKeys = (paths: CatalogCategory[][]) => {
  const heroCategories = new Map<string, string>();
  for (const path of paths) {
    const key = path[1]?.key;
    const linked = key ? heroCategoryForKey(key, [path]) : null;
    if (linked) heroCategories.set(linked.hero, linked.category.key);
  }
  return heroCategories;
};

/** Changing heroes resets source-specific skin types so no previous hero stays hidden in a key. */
export const changeCatalogHeroes = (
  heroes: string[],
  selection: CatalogFilterSelection,
  paths: CatalogCategory[][],
): CatalogFilterSelection => {
  const keys = selection.keys.filter(
    (key) => categoryPathForKey(key, paths)?.[0]?.name !== SKINS_SUPER_CATEGORY,
  );
  return {
    categories:
      keys.length < selection.keys.length
        ? [...new Set([...selection.categories, SKINS_SUPER_CATEGORY])]
        : selection.categories,
    keys,
    heroes,
  };
};

/** A linked exclusion targets the selected skin branches, rather than every skin or hero mod. */
export const catalogQueryFilterSelection = (
  selection: CatalogFilterSelection,
  paths: CatalogCategory[][],
  exclude: boolean,
): CatalogFilterSelection => {
  if (!exclude || selection.heroes.length === 0) return selection;
  const heroCategories = skinHeroCategoryKeys(paths);
  const broadSkins = selection.categories.includes(SKINS_SUPER_CATEGORY);
  const canScopeBroadSkins =
    broadSkins && selection.heroes.every((hero) => heroCategories.has(hero));
  const keys = new Set(selection.keys);
  if (canScopeBroadSkins) {
    for (const hero of selection.heroes) {
      const key = heroCategories.get(hero);
      if (key) keys.add(key);
    }
  }
  const linkedHeroes = new Set(
    [...keys].flatMap((key) => {
      const linked = heroCategoryForKey(key, paths);
      return linked ? [linked.hero] : [];
    }),
  );
  return {
    categories: canScopeBroadSkins
      ? selection.categories.filter(
          (category) => category !== SKINS_SUPER_CATEGORY,
        )
      : selection.categories,
    keys: [...keys],
    heroes: selection.heroes.filter((hero) => {
      const normalized = normalizeHero(hero);
      return !normalized || !linkedHeroes.has(normalized);
    }),
  };
};
