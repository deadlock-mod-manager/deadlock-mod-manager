import type { ConfigEntry } from "../../src/schema";
import { type KvNode, normalizeValue, parseCommentedPair, parseKv } from "./kv";

interface ConvarValue {
  /** Key as the author wrote it. */
  key: string;
  value: string;
  /** Children of an object-valued convar (`rate { min default max }`). */
  object?: Map<string, { key: string; value: string }>;
}

interface Leaf {
  /** Section path below `GameInfo`, author casing. Empty for root keys. */
  path: string[];
  key: string;
  value: string;
}

export interface ParsedGameinfo {
  /** A whole file (has a `GameInfo` block) rather than a ConVars snippet. */
  fullFile: boolean;
  pgiVersion: string | null;
  /** Lower-cased name to the last occurrence, in first-occurrence order. */
  convars: Map<string, ConvarValue>;
  /** Scalars outside the root ConVars block. */
  leaves: Leaf[];
  /** Full-line `// key "value"` comments outside ConVars, with their section. */
  commented: Leaf[];
  errors: string[];
}

type BlockNode = Extract<KvNode, { kind: "block" }>;

const lower = (parts: string[]): string[] =>
  parts.map((part) => part.toLowerCase());

const leafId = (path: string[], key: string): string =>
  [...lower(path), key.toLowerCase()].join("/");

const pathHasPrefix = (path: string[], prefix: string): boolean => {
  const parts = prefix
    .split("/")
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  if (parts.length > path.length) return false;
  return parts.every((part, index) => part === path[index].toLowerCase());
};

const inSections = (path: string[], sections: string[]): boolean =>
  sections.some((section) => pathHasPrefix(path, section));

const isBlockNamed = (node: KvNode, name: string): node is BlockNode =>
  node.kind === "block" && node.key.toLowerCase() === name;

const readConvars = (nodes: KvNode[]): Map<string, ConvarValue> => {
  const convars = new Map<string, ConvarValue>();
  for (const node of nodes) {
    if (!node.key || node.kind === "empty") continue;
    let entry: ConvarValue;
    if (node.kind === "block") {
      const object = new Map<string, { key: string; value: string }>();
      for (const child of node.children) {
        if (child.kind === "scalar") {
          object.set(child.key.toLowerCase(), {
            key: child.key,
            value: child.value,
          });
        }
      }
      entry = { key: node.key, value: "", object };
    } else {
      entry = { key: node.key, value: node.value };
    }
    // Map.set keeps the first occurrence's position; the engine reads the last value.
    convars.set(node.key.toLowerCase(), entry);
  }
  return convars;
};

export const parseGameinfo = (text: string): ParsedGameinfo => {
  const document = parseKv(text);
  const gameInfo = document.root.find((node): node is BlockNode =>
    isBlockNamed(node, "gameinfo"),
  );
  const top = gameInfo ? gameInfo.children : document.root;
  const convarBlocks = top.filter((node): node is BlockNode =>
    isBlockNamed(node, "convars"),
  );
  const convarNodes =
    convarBlocks.length > 0 || gameInfo
      ? convarBlocks.flatMap((node) => node.children)
      : document.root;

  const leaves: Leaf[] = [];
  const blocks: { path: string[]; line: number; endLine: number }[] = [];
  const walk = (nodes: KvNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.kind === "block") {
        if (path.length === 0 && node.key.toLowerCase() === "convars") continue;
        const childPath = [...path, node.key];
        blocks.push({
          path: childPath,
          line: node.line,
          endLine: node.endLine,
        });
        walk(node.children, childPath);
      } else if (node.kind === "scalar") {
        leaves.push({ path, key: node.key, value: node.value });
      }
    }
  };
  if (gameInfo) walk(top, []);

  // Assign each full-line comment to the innermost section around it.
  const commented: Leaf[] = [];
  if (gameInfo) {
    for (const comment of document.comments) {
      if (comment.trailing) continue;
      const pair = parseCommentedPair(comment.text);
      if (!pair) continue;
      let section: string[] | null = null;
      for (const block of blocks) {
        if (block.line < comment.line && comment.line < block.endLine) {
          if (!section || block.path.length > section.length)
            section = block.path;
        }
      }
      if (section)
        commented.push({ path: section, key: pair.key, value: pair.value });
    }
  }

  const pgiLeaf = leaves.find(
    (leaf) => leaf.path.length === 0 && leaf.key.toLowerCase() === "pgiversion",
  );
  return {
    fullFile: Boolean(gameInfo),
    pgiVersion: pgiLeaf ? pgiLeaf.value.toUpperCase() : null,
    convars: readConvars(convarNodes),
    leaves,
    commented,
    errors: document.errors,
  };
};

/** Leaves grouped by section path + key; a group with several values is a list. */
const groupLeaves = (leaves: Leaf[]): Map<string, Leaf[]> => {
  const groups = new Map<string, Leaf[]>();
  for (const leaf of leaves) {
    const id = leafId(leaf.path, leaf.key);
    const group = groups.get(id);
    if (group) group.push(leaf);
    else groups.set(id, [leaf]);
  }
  return groups;
};

/**
 * Sections that hold a list rather than key/value pairs (SearchPaths,
 * RenderModes): a key repeats inside them. With `distinctOnly`, a repeated key
 * only counts when its values differ, so an author's duplicated line doesn't
 * turn a section into a list.
 */
const listSections = (
  parsed: ParsedGameinfo,
  distinctOnly = false,
): Set<string> => {
  const sections = new Set<string>();
  for (const [id, group] of groupLeaves(parsed.leaves)) {
    const list = group.map((leaf) => normalizeValue(leaf.value));
    const repeated = distinctOnly ? new Set(list).size > 1 : list.length > 1;
    if (repeated) sections.add(id.slice(0, id.lastIndexOf("/")));
  }
  return sections;
};

const sectionId = (path: string[]): string => lower(path).join("/");

/**
 * Every scalar of a stock file as entries: ConVars (object convars as one
 * entry per child) and section scalars, without FileSystem/SearchPaths and list
 * sections.
 */
export const stockEntries = (parsed: ParsedGameinfo): ConfigEntry[] => {
  const entries: ConfigEntry[] = [];
  for (const convar of parsed.convars.values()) {
    if (convar.object) {
      for (const child of convar.object.values()) {
        entries.push({
          path: ["ConVars", convar.key, child.key],
          value: child.value,
        });
      }
    } else {
      entries.push({ path: ["ConVars", convar.key], value: convar.value });
    }
  }
  const lists = listSections(parsed);
  for (const leaf of parsed.leaves) {
    if (pathHasPrefix(leaf.path, "FileSystem/SearchPaths")) continue;
    if (lists.has(sectionId(leaf.path))) continue;
    entries.push({ path: [...leaf.path, leaf.key], value: leaf.value });
  }
  return entries;
};

export interface StockVersion {
  build: number;
  date: string;
  commit: string;
  parsed: ParsedGameinfo;
}

const leafCounter = (parsed: ParsedGameinfo): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const leaf of parsed.leaves) {
    if (pathHasPrefix(leaf.path, "FileSystem/SearchPaths")) continue;
    const id = `${leafId(leaf.path, leaf.key)}=${normalizeValue(leaf.value)}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
};

const jaccard = (a: Map<string, number>, b: Map<string, number>): number => {
  let intersection = 0;
  let union = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const x = a.get(key) ?? 0;
    const y = b.get(key) ?? 0;
    intersection += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union === 0 ? 0 : intersection / union;
};

interface BaseMatch {
  stock: StockVersion;
  /** Matched by `PGIVersion`. */
  exact: boolean;
}

/**
 * The stock file a config was built on: the `PGIVersion` match when the config
 * carries one (closest among builds sharing that hash), otherwise the closest
 * stock file by section-scalar overlap, tie-broken by matching ConVars.
 */
export const pickBase = (
  config: ParsedGameinfo,
  history: StockVersion[],
): BaseMatch => {
  const byPgi = config.pgiVersion
    ? history.filter((stock) => stock.parsed.pgiVersion === config.pgiVersion)
    : [];
  const candidates = byPgi.length > 0 ? byPgi : history;
  const configLeaves = leafCounter(config);
  let best: { stock: StockVersion; score: [number, number] } | null = null;
  for (const stock of candidates) {
    const leafScore = jaccard(configLeaves, leafCounter(stock.parsed));
    let sameConvars = 0;
    for (const [name, value] of stock.parsed.convars) {
      const mine = config.convars.get(name);
      if (mine && !mine.object && !value.object) {
        if (normalizeValue(mine.value) === normalizeValue(value.value))
          sameConvars += 1;
      }
    }
    const convarScore = sameConvars / Math.max(1, stock.parsed.convars.size);
    const score: [number, number] = [leafScore, convarScore];
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] && score[1] > best.score[1])
    ) {
      best = { stock, score };
    }
  }
  if (!best) throw new Error("Stock history is empty");
  return { stock: best.stock, exact: byPgi.length > 0 };
};

interface DeltaRules {
  excludedSections: string[];
}

export interface Delta {
  entries: ConfigEntry[];
  /** Edits we drop: list sections, root keys, excluded sections. */
  skipped: { listSection: string[]; rootKey: string[]; excluded: string[] };
  /** Top-level sections the config edits that the base file doesn't have. */
  unknownSections: string[];
}

/**
 * The author's changes relative to `base`. ConVars that are new or differ
 * (normalized), section scalars that are new or differ, and section keys the
 * author commented out (value `null`). A key that is merely missing is never a
 * deletion.
 */
export const computeDelta = (
  config: ParsedGameinfo,
  base: ParsedGameinfo,
  rules: DeltaRules,
): Delta => {
  const entries: ConfigEntry[] = [];
  const skipped: Delta["skipped"] = {
    listSection: [],
    rootKey: [],
    excluded: [],
  };

  for (const [name, convar] of config.convars) {
    const stock = base.convars.get(name);
    if (convar.object) {
      for (const [childName, child] of convar.object) {
        const stockChild = stock?.object?.get(childName);
        if (
          !stockChild ||
          normalizeValue(stockChild.value) !== normalizeValue(child.value)
        ) {
          entries.push({
            path: ["ConVars", convar.key, child.key],
            value: child.value,
          });
        }
      }
      continue;
    }
    if (
      !stock ||
      stock.object ||
      normalizeValue(stock.value) !== normalizeValue(convar.value)
    ) {
      entries.push({ path: ["ConVars", convar.key], value: convar.value });
    }
  }

  const configGroups = groupLeaves(config.leaves);
  const baseGroups = groupLeaves(base.leaves);
  const lists = new Set([...listSections(base), ...listSections(config, true)]);
  const baseSections = new Set(
    base.leaves
      .filter((leaf) => leaf.path.length > 0)
      .map((leaf) => leaf.path[0].toLowerCase()),
  );
  const unknownSections = new Set<string>();
  const commented = new Map<string, Leaf>();
  for (const leaf of config.commented)
    commented.set(leafId(leaf.path, leaf.key), leaf);

  const ids = [
    ...configGroups.keys(),
    ...[...baseGroups.keys()].filter((id) => !configGroups.has(id)),
  ];
  for (const id of ids) {
    const mine = configGroups.get(id) ?? [];
    const stock = baseGroups.get(id) ?? [];
    const sample = mine[0] ?? stock[0];
    const label = [...sample.path, sample.key].join("/");
    const sameMultiset = () => {
      const a = mine.map((leaf) => normalizeValue(leaf.value)).sort();
      const b = stock.map((leaf) => normalizeValue(leaf.value)).sort();
      return (
        a.length === b.length && a.every((value, index) => value === b[index])
      );
    };
    if (pathHasPrefix(sample.path, "FileSystem")) continue;
    if (mine.length > 0 && stock.length > 0 && sameMultiset()) continue;
    if (mine.length === 0 && !commented.has(id)) continue;
    if (sample.path.length === 0) {
      skipped.rootKey.push(label);
      continue;
    }
    if (inSections(sample.path, rules.excludedSections)) {
      skipped.excluded.push(label);
      continue;
    }
    if (lists.has(sectionId(sample.path))) {
      skipped.listSection.push(label);
      continue;
    }
    if (!baseSections.has(sample.path[0].toLowerCase()))
      unknownSections.add(sample.path[0]);
    if (mine.length > 0) {
      const leaf = mine[mine.length - 1];
      entries.push({ path: [...leaf.path, leaf.key], value: leaf.value });
    } else {
      entries.push({ path: [...stock[0].path, stock[0].key], value: null });
    }
  }

  return { entries, skipped, unknownSections: [...unknownSections] };
};
