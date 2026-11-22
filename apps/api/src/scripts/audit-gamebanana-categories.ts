#!/usr/bin/env bun

/**
 * Audits how DMM files every Deadlock submission on GameBanana. Walks the live
 * category tree, pages through the Mod and Sound indexes, and runs each
 * submission through the category and hero resolution the way three callers
 * see it:
 *
 * - api-sync: the API sync, which has the profile and the index root category
 * - detail-page: the desktop detail page, which has the profile and keeps the
 *   category the sync stored (a page opened before its first sync falls back
 *   to the profile's category)
 * - bulk-sync: the desktop bulk sync, which has the index root, the leaf
 *   category name from the legacy hydration API, and the hero above a skin
 *   subcategory from its walk of the Skins tree
 *
 * The desktop paths are Rust; the TS helpers stand in for them, kept in step
 * by the normalizer parity fixtures. Expected values come from the tree: the
 * category is the root category, and a skin's hero is the Skins child above
 * it. Skins filed directly under Skins have no category hero and are skipped.
 *
 * Usage:
 * pnpm --filter api audit-gamebanana-categories
 * pnpm --filter api audit-gamebanana-categories -- --verify-profiles=40 --json=audit.json
 */

import { writeFile } from "node:fs/promises";
import {
  type DeadlockHeroes,
  type GameBanana,
  heroRegistry,
  SKINS_SUPER_CATEGORY,
} from "@deadlock-mods/shared";
import {
  DEADLOCK_GAME_ID,
  GAME_BANANA_BASE_URL,
  INDEX_PAGE_SIZE,
} from "@/providers/game-banana/constants";
import {
  categoryFromGameBananaProfile,
  heroFromGameBananaProfile,
} from "@/providers/game-banana/utils";

type Model = "Mod" | "Sound";
const CALLERS = ["api-sync", "detail-page", "bulk-sync"] as const;
type CallerPath = (typeof CALLERS)[number];

type CategoryListing = {
  _idRow: number;
  _sName: string;
  _nCategoryCount: number;
  _sUrl: string;
  _sIconUrl: string;
};

type PendingCategory = { listing: CategoryListing; parentId: number | null };

type CategoryNode = {
  id: number;
  name: string;
  parentId: number | null;
  url: string;
  iconUrl: string;
};

type IndexCategory = { _sName: string; _sProfileUrl: string };

type IndexRecord = {
  _idRow: number;
  _sName: string;
  _aRootCategory: IndexCategory;
  _aSubCategory?: IndexCategory;
};

type Resolution = { category: string; hero: DeadlockHeroes | null };

type Issue = {
  kind: "category" | "hero-missing" | "hero-wrong" | "untracked-category";
  caller: CallerPath | "tree";
  model: Model;
  id: number;
  name: string;
  path: string;
  expected: string | null;
  actual: string | null;
};

const CONCURRENCY = 4;
const EXAMPLES_PER_GROUP = 15;

const flag = (name: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const fetchJson = async <T>(url: string): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": "DeadlockModManager-CategoryAudit" },
    });
    // GameBanana occasionally answers 200 with an empty body under load.
    const body = response.ok ? await response.text() : "";
    if (body) return JSON.parse(body) as T;
    if (attempt === 4) {
      throw new Error(`GameBanana returned ${response.status} for ${url}`);
    }
    await Bun.sleep(attempt * 1_000);
  }
};

const mapConcurrent = async <T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
};

const categoryIdFromUrl = (url: string) => {
  const id = /\/cats\/(\d+)/.exec(url)?.[1];
  return id ? Number(id) : null;
};

const fetchCategoryTree = async (model: Model) => {
  const nodes = new Map<number, CategoryNode>();
  let level: PendingCategory[] = await fetchJson<CategoryListing[]>(
    `${GAME_BANANA_BASE_URL}/${model}/Categories?_idGameRow=${DEADLOCK_GAME_ID}&_sSort=a_to_z&_bShowEmpty=true`,
  ).then((roots) => roots.map((listing) => ({ listing, parentId: null })));

  while (level.length > 0) {
    for (const { listing, parentId } of level) {
      nodes.set(listing._idRow, {
        id: listing._idRow,
        name: listing._sName,
        parentId,
        url: listing._sUrl,
        iconUrl: listing._sIconUrl,
      });
    }
    const parents = level.filter(({ listing }) => listing._nCategoryCount > 0);
    const children = await mapConcurrent(parents, async ({ listing }) =>
      (
        await fetchJson<CategoryListing[]>(
          `${GAME_BANANA_BASE_URL}/${model}/Categories?_idCategoryRow=${listing._idRow}&_sSort=a_to_z&_bShowEmpty=true`,
        )
      ).map((child) => ({ listing: child, parentId: listing._idRow })),
    );
    level = children.flat();
  }
  return nodes;
};

const pathTo = (nodes: Map<number, CategoryNode>, id: number) => {
  const path: CategoryNode[] = [];
  for (let node = nodes.get(id); node; ) {
    path.unshift(node);
    node = node.parentId === null ? undefined : nodes.get(node.parentId);
  }
  return path;
};

const fetchIndex = async (model: Model) => {
  const url = (page: number) =>
    `${GAME_BANANA_BASE_URL}/${model}/Index?_nPerpage=${INDEX_PAGE_SIZE}&_aFilters%5BGeneric_Game%5D=${DEADLOCK_GAME_ID}&_nPage=${page}`;
  const first = await fetchJson<
    GameBanana.GameBananaPaginatedResponse<IndexRecord>
  >(url(1));
  const pageCount = Math.ceil(first._aMetadata._nRecordCount / INDEX_PAGE_SIZE);
  const rest = await mapConcurrent(
    Array.from({ length: pageCount - 1 }, (_, index) => index + 2),
    async (page) =>
      (
        await fetchJson<GameBanana.GameBananaPaginatedResponse<IndexRecord>>(
          url(page),
        )
      )._aRecords,
  );
  return [first._aRecords, ...rest].flat();
};

const profileCategory = (node: CategoryNode, model: Model) => ({
  _idRow: node.id,
  _sName: node.name,
  _sModelName: `${model}Category`,
  _sProfileUrl: node.url,
  _sIconUrl: node.iconUrl,
});

const resolveForCallers = (
  record: IndexRecord,
  path: CategoryNode[],
  model: Model,
) => {
  const leaf = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  // A profile's category is the leaf and its super category is the leaf's parent.
  const profile = {
    _sName: record._sName,
    _aCategory: profileCategory(leaf, model),
    _aSuperCategory: parent && profileCategory(parent, model),
  };
  const root = record._aRootCategory._sName;
  // The desktop sync maps every category below a Skins hero to that hero.
  const treeHero =
    model === "Mod" && path.length > 2 && path[0].name === SKINS_SUPER_CATEGORY
      ? (heroRegistry.normalize(path[1].name) ?? undefined)
      : undefined;

  return {
    "api-sync": {
      category: categoryFromGameBananaProfile(profile, root),
      hero: heroFromGameBananaProfile(profile, root),
    },
    "detail-page": {
      category: root,
      hero: heroFromGameBananaProfile(profile),
    },
    "bulk-sync": {
      category: root,
      hero: heroRegistry.resolveFromSkinCategory(
        { root, parent: treeHero, category: leaf.name },
        record._sName,
      ),
    },
  } satisfies Record<CallerPath, Resolution>;
};

const auditModel = async (model: Model, issues: Issue[]) => {
  const [nodes, records] = await Promise.all([
    fetchCategoryTree(model),
    fetchIndex(model),
  ]);
  let skinsWithCategoryHero = 0;

  for (const node of nodes.values()) {
    const path = pathTo(nodes, node.id);
    if (path.length === 2 && path[0].name === SKINS_SUPER_CATEGORY) {
      if (!heroRegistry.normalize(node.name)) {
        issues.push({
          kind: "hero-missing",
          caller: "tree",
          model,
          id: node.id,
          name: node.name,
          path: path.map(({ name }) => name).join(" > "),
          expected: "a hero alias for this Skins category",
          actual: null,
        });
      }
    }
  }

  for (const record of records) {
    const leafId = categoryIdFromUrl(
      (record._aSubCategory ?? record._aRootCategory)._sProfileUrl,
    );
    const path = leafId === null ? [] : pathTo(nodes, leafId);
    const pathLabel = path.map(({ name }) => name).join(" > ");
    const base = {
      model,
      id: record._idRow,
      name: record._sName,
      path: pathLabel,
    };
    if (path.length === 0) {
      issues.push({
        ...base,
        kind: "untracked-category",
        caller: "tree",
        path: record._aSubCategory?._sName ?? record._aRootCategory._sName,
        expected: null,
        actual: null,
      });
      continue;
    }

    const expectedCategory = path[0].name;
    const expectedHero =
      expectedCategory === SKINS_SUPER_CATEGORY && path.length > 1
        ? heroRegistry.normalize(path[1].name)
        : null;
    if (expectedHero) skinsWithCategoryHero++;

    const resolutions = resolveForCallers(record, path, model);
    for (const caller of CALLERS) {
      const actual = resolutions[caller];
      if (actual.category !== expectedCategory) {
        issues.push({
          ...base,
          kind: "category",
          caller,
          expected: expectedCategory,
          actual: actual.category,
        });
      }
      if (expectedHero && actual.hero !== expectedHero) {
        issues.push({
          ...base,
          kind: actual.hero ? "hero-wrong" : "hero-missing",
          caller,
          expected: expectedHero,
          actual: actual.hero,
        });
      }
    }
  }

  return {
    summary: {
      model,
      categories: nodes.size,
      submissions: records.length,
      skinsWithCategoryHero,
    },
    nodes,
    records,
  };
};

const verifyProfiles = async (
  count: number,
  nodes: Map<number, CategoryNode>,
  records: IndexRecord[],
  issues: Issue[],
) => {
  // Spot-check the assumption the audit rests on: a profile's category is the
  // index leaf and its super category is the leaf's parent.
  const skins = records.filter(
    (record) => record._aRootCategory._sName === SKINS_SUPER_CATEGORY,
  );
  const sample = skins
    .map((record) => ({ record, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map(({ record }) => record);

  await mapConcurrent(sample, async (record) => {
    const profile = await fetchJson<GameBanana.GameBananaModProfile>(
      `${GAME_BANANA_BASE_URL}/Mod/${record._idRow}/ProfilePage`,
    );
    const leafId = categoryIdFromUrl(
      (record._aSubCategory ?? record._aRootCategory)._sProfileUrl,
    );
    const path = leafId === null ? [] : pathTo(nodes, leafId);
    const derived = path
      .slice(-2)
      .map(({ name }) => name)
      .join(" > ");
    const actual = [profile._aSuperCategory?._sName, profile._aCategory._sName]
      .filter(Boolean)
      .join(" > ");
    if (derived !== actual) {
      issues.push({
        kind: "category",
        caller: "tree",
        model: "Mod",
        id: record._idRow,
        name: record._sName,
        path: path.map(({ name }) => name).join(" > "),
        expected: derived,
        actual,
      });
    }
  });
  return sample.length;
};

const printIssues = (issues: Issue[]) => {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = `${issue.caller} / ${issue.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  for (const [group, entries] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`\n${group}: ${entries.length}`);
    for (const issue of entries.slice(0, EXAMPLES_PER_GROUP)) {
      console.log(
        `  ${issue.model} ${issue.id} "${issue.name}" [${issue.path}] expected ${issue.expected ?? "-"}, got ${issue.actual ?? "-"}`,
      );
    }
    if (entries.length > EXAMPLES_PER_GROUP) {
      console.log(`  ... ${entries.length - EXAMPLES_PER_GROUP} more`);
    }
  }
};

const auditGameBananaCategories = async () => {
  const issues: Issue[] = [];
  console.log("Fetching Mod categories and index...");
  const mods = await auditModel("Mod", issues);
  console.log("Fetching Sound categories and index...");
  const sounds = await auditModel("Sound", issues);
  const summaries = [mods.summary, sounds.summary];

  const profileCount = Number(flag("verify-profiles") ?? 0);
  if (profileCount > 0) {
    console.log(`Verifying ${profileCount} skin profiles...`);
    const verified = await verifyProfiles(
      profileCount,
      mods.nodes,
      mods.records,
      issues,
    );
    console.log(`Verified ${verified} profiles against the category tree.`);
  }

  console.table(summaries);
  printIssues(issues);
  console.log(
    issues.length === 0 ? "\nNo mismatches." : `\n${issues.length} mismatches.`,
  );

  const jsonPath = flag("json");
  if (jsonPath) {
    await writeFile(jsonPath, `${JSON.stringify(issues, null, 2)}\n`);
    console.log(`Wrote ${jsonPath}`);
  }
  process.exit(issues.length === 0 ? 0 : 1);
};

if (import.meta.main) {
  auditGameBananaCategories().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
