import type { ConfigEntry } from "../../src/schema";
import { type KvNode, normalizeValue, parseCommentedPair, parseKv } from "./kv";

interface ConvarValue {
  key: string;
  value: string;
  object?: Map<string, { key: string; value: string }>;
}

interface Leaf {
  path: string[];
  key: string;
  value: string;
}

export interface ParsedGameinfo {
  fullFile: boolean;
  pgiVersion: string | null;
  convars: Map<string, ConvarValue>;
  leaves: Leaf[];
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
  exact: boolean;
}

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
  skipped: { listSection: string[]; rootKey: string[]; excluded: string[] };
  unknownSections: string[];
}

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
  const baseSectionIds = new Set(
    base.leaves.map((leaf) => sectionId(leaf.path)),
  );
  const lists = listSections(base);
  for (const section of listSections(config, true))
    if (!baseSectionIds.has(section)) lists.add(section);
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
