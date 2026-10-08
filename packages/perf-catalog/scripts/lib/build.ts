import {
  CATEGORIES,
  CATEGORY_OVERRIDES,
  CATEGORY_RULES,
  SECTION_CATEGORIES,
} from "../../curated/categories";
import { COMMUNITY } from "../../curated/community";
import {
  HIDES_THINGS,
  MIN_AGREEMENT,
  MIN_LINEAGES,
} from "../../curated/consensus";
import { CURATED_CONVARS } from "../../curated/convars";
import {
  ALLOW_IN_BODY,
  GAMEPLAY,
  GAMEPLAY_PATTERNS,
  PATTERN_DEFAULTS,
} from "../../curated/gameplay";
import {
  PRESETS,
  UPSTREAM_FILES,
  type UpstreamFile,
} from "../../curated/presets";
import { REMOVED_CONVARS } from "../../curated/removed";
import { RULES } from "../../curated/rules";
import { VIDEO_MENU, type VideoMenuOption } from "../../curated/video";
import {
  type Catalog,
  type CatalogCommunityConfig,
  type CatalogPreset,
  type ConfigEntry,
  type ConvarMeta,
  SCHEMA_VERSION,
} from "../../src/schema";
import {
  decodeText,
  fetchPinned,
  githubBlobUrl,
  githubRawUrl,
  mapLimit,
} from "./fetch";
import { readCommunityVariant } from "./gamebanana";
import {
  computeDelta,
  type Delta,
  type ParsedGameinfo,
  parseGameinfo,
  pickBase,
  type StockVersion,
  stockEntries,
} from "./gameinfo";
import { type DumpVersion, parseConvarDump, statusSince } from "./history";
import { isNumeric, normalizeValue } from "./kv";
import { convarFacts, schemaDumpSchema } from "./schema-explorer";
import type { Sources } from "./sources";

type GameplayClass = NonNullable<ConvarMeta["gameplay"]>;
type VideoSetting = NonNullable<CatalogPreset["videoSettings"]>[number];

interface AnalyzedFile {
  parsed: ParsedGameinfo;
  base: StockVersion;
  exact: boolean;
  delta: Delta;
}

const lowerName = (path: string[]) => path[1].toLowerCase();
/** Code-unit order, so the output doesn't depend on the machine's locale. */
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isConvarEntry = (entry: ConfigEntry) =>
  entry.path.length >= 2 && entry.path[0].toLowerCase() === "convars";

const curatedConvars = new Map(
  [...CURATED_CONVARS].map(([name, curated]) => [name.toLowerCase(), curated]),
);

const deniedPatterns = (RULES.denied ?? []).flatMap((rule) =>
  rule.pattern ? [new RegExp(rule.pattern, "i")] : [],
);

const isDeniedConvar = (name: string): boolean =>
  deniedPatterns.some((pattern) => pattern.test(name)) ||
  (RULES.denied ?? []).some(
    (rule) =>
      rule.path?.length === 2 &&
      rule.path[0].toLowerCase() === "convars" &&
      rule.path[1].toLowerCase() === name.toLowerCase(),
  );

const gameplayClass = (name: string): GameplayClass | null => {
  const key = name.toLowerCase();
  const explicit = GAMEPLAY.get(key);
  if (explicit) return explicit.class;
  if (ALLOW_IN_BODY.has(key)) return null;
  return PATTERN_DEFAULTS.find((rule) => rule.pattern.test(key))?.class ?? null;
};

const categoryFor = (name: string, gameplay: GameplayClass | null): string => {
  const key = name.toLowerCase();
  const override = CATEGORY_OVERRIDES.get(key);
  if (override) return override;
  if (gameplay === "camera" || gameplay === "visibility") return "camera";
  if (gameplay === "devtools") return "other";
  return (
    CATEGORY_RULES.find((rule) => rule.pattern.test(key))?.category ?? "other"
  );
};

/** Kind for a key Valve's dump doesn't know, from the values configs give it. */
const inferKind = (name: string, values: string[]): ConvarMeta["kind"] => {
  const lower = values.map((value) => value.trim().toLowerCase());
  if (lower.length === 0) return "string";
  if (lower.every((value) => value === "true" || value === "false"))
    return "bool";
  if (lower.every((value) => ["0", "1", "true", "false"].includes(value))) {
    return /enable|disable|allow|use_|draw|show|^r_|_on$/.test(
      name.toLowerCase(),
    )
      ? "bool"
      : "int";
  }
  if (lower.every((value) => /^-?\d+$/.test(value))) return "int";
  if (lower.every((value) => isNumeric(value))) return "float";
  return "string";
};

const videoDisplay = (
  option: VideoMenuOption,
  value: string,
): string | null => {
  const normalized = normalizeValue(value);
  if (option.values) return option.values[normalized] ?? null;
  if (option.bool)
    return normalized === "1" ? "On" : normalized === "0" ? "Off" : null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (option.range && (number < option.range[0] || number > option.range[1]))
    return null;
  return option.percent ? `${Math.round(number * 100)}%` : String(number);
};

const videoSettings = (text: string): VideoSetting[] => {
  const settings = new Map<string, string>();
  for (const match of text.matchAll(/"setting\.([^"]+)"\s+"([^"]*)"/g))
    settings.set(match[1].toLowerCase(), match[2]);
  const out: VideoSetting[] = [];
  for (const [key, option] of VIDEO_MENU) {
    const value = settings.get(key);
    if (value === undefined) continue;
    const entry: VideoSetting = { key, value, label: option.label };
    const display = videoDisplay(option, value);
    if (display) entry.display = display;
    out.push(entry);
  }
  return out;
};

/** Drops `undefined`, `null` and empty arrays so the bundled file stays small. */
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) =>
        field !== undefined &&
        field !== null &&
        !(Array.isArray(field) && field.length === 0),
    ),
  ) as T;

const pinOf = (sources: Sources, file: UpstreamFile) => {
  const pin = sources.upstream[file.id];
  if (!pin)
    throw new Error(
      `No pin for ${file.id} in sources.json; run with --refresh`,
    );
  if (pin.repo !== file.repo || pin.path !== file.path) {
    throw new Error(
      `Pin for ${file.id} points at ${pin.repo}/${pin.path}; run with --refresh`,
    );
  }
  return pin;
};

export const buildCatalog = async (
  sources: Sources,
): Promise<{ catalog: Catalog; report: { lines: string[] } }> => {
  const lines: string[] = [];

  const se = sources.schemaExplorer;
  const dump = schemaDumpSchema.parse(
    JSON.parse(
      decodeText(
        await fetchPinned({
          url: githubRawUrl(se.repo, se.commit, se.path),
          sha256: se.sha256,
        }),
      ),
    ),
  );
  const facts = convarFacts(dump);
  const factsByName = new Map(
    facts.map((fact) => [fact.name.toLowerCase(), fact]),
  );
  const commands = new Set(
    dump.commands.map((command) => command.name.toLowerCase()),
  );

  // Stock gameinfo.gi history, newest first, one file per build.
  const gt = sources.gameTracking;
  const stockAll = await mapLimit(
    gt.gameinfo.versions,
    6,
    async (pin): Promise<StockVersion> => {
      const data = await fetchPinned({
        url: githubRawUrl(gt.repo, pin.commit, gt.gameinfo.path),
        sha256: pin.sha256,
      });
      return {
        build: pin.build,
        date: pin.date,
        commit: pin.commit,
        parsed: parseGameinfo(decodeText(data)),
      };
    },
  );
  const stock: StockVersion[] = [];
  for (const version of [...stockAll].sort(
    (a, b) => b.date.localeCompare(a.date) || b.build - a.build,
  )) {
    if (!stock.some((kept) => kept.build === version.build))
      stock.push(version);
  }
  const latestStock = stock[0];

  const dumps: DumpVersion[] = await mapLimit(
    gt.convarHistory.versions,
    6,
    async (pin) => ({
      build: pin.build,
      convars: parseConvarDump(
        decodeText(
          await fetchPinned({
            url: githubRawUrl(gt.repo, pin.commit, gt.convarHistory.path),
            sha256: pin.sha256,
          }),
        ),
      ),
    }),
  );

  const analyze = (text: string): AnalyzedFile => {
    const parsed = parseGameinfo(text);
    const { stock: base, exact } = pickBase(parsed, stock);
    return {
      parsed,
      base,
      exact,
      delta: computeDelta(parsed, base.parsed, RULES),
    };
  };

  const upstream = new Map<
    string,
    AnalyzedFile & { text: string; video?: string }
  >();
  for (const file of UPSTREAM_FILES) {
    const pin = pinOf(sources, file);
    const text = decodeText(
      await fetchPinned({
        url: githubRawUrl(file.repo, pin.commit, file.path),
        sha256: pin.sha256,
      }),
    );
    const video = pin.video
      ? decodeText(
          await fetchPinned({
            url: githubRawUrl(file.repo, pin.commit, pin.video.path),
            sha256: pin.video.sha256,
          }),
        )
      : undefined;
    upstream.set(file.id, { ...analyze(text), text, video });
  }

  // GameBanana configs: analyzed for stats only.
  const community = new Map<string, AnalyzedFile & { variantPath: string }>();
  for (const definition of COMMUNITY) {
    const pin = sources.community[String(definition.gamebananaId)];
    if (!pin)
      throw new Error(
        `No pin for GameBanana ${definition.gamebananaId}; run with --refresh`,
      );
    if (definition.fileId && pin.fileId !== definition.fileId) {
      throw new Error(
        `GameBanana ${definition.gamebananaId}: pinned ${pin.fileId}, expected ${definition.fileId}`,
      );
    }
    const variant = await readCommunityVariant(pin, definition.variantHint);
    community.set(definition.id, {
      ...analyze(variant.text),
      variantPath: variant.path,
    });
  }

  // Convar metadata: every convar in the dump, plus keys configs or stock use
  // that the dump doesn't have.
  const seenValues = new Map<string, { name: string; values: string[] }>();
  const see = (name: string, value: string | null) => {
    const key = name.toLowerCase();
    const entry = seenValues.get(key) ?? { name, values: [] };
    if (value !== null) entry.values.push(value);
    seenValues.set(key, entry);
  };
  for (const version of stock) {
    for (const convar of version.parsed.convars.values())
      see(convar.key, convar.object ? null : convar.value);
  }
  for (const file of [...upstream.values(), ...community.values()]) {
    for (const entry of file.delta.entries) {
      if (isConvarEntry(entry) && entry.path.length === 2)
        see(entry.path[1], entry.value);
    }
  }
  for (const name of REMOVED_CONVARS.keys()) see(name, null);

  const metas = new Map<string, ConvarMeta>();
  for (const fact of facts) {
    const key = fact.name.toLowerCase();
    const gameplay = gameplayClass(key);
    const curated = curatedConvars.get(key);
    const blocked = fact.flags?.includes("gameinfo_cannot_override") ?? false;
    metas.set(
      key,
      compact({
        ...fact,
        label: curated?.label,
        description: curated?.description,
        category: categoryFor(key, gameplay),
        gameplay,
        sideEffects: curated?.sideEffects,
        status: blocked ? "blocked" : undefined,
        statusSinceBuild: blocked
          ? statusSince(key, "blocked", dumps)
          : undefined,
      }),
    );
  }
  for (const [key, seen] of seenValues) {
    if (factsByName.has(key)) continue;
    const gameplay = gameplayClass(key);
    const curated = curatedConvars.get(key);
    const removed = REMOVED_CONVARS.get(key);
    const isCommand = commands.has(key);
    metas.set(
      key,
      compact({
        name: seen.name,
        kind: isCommand
          ? "string"
          : (removed?.kind ?? inferKind(key, seen.values)),
        help: removed?.help,
        label: curated?.label,
        description: curated?.description,
        category: categoryFor(key, gameplay),
        gameplay,
        sideEffects: curated?.sideEffects,
        status: isCommand ? "notConvar" : "removed",
        statusSinceBuild: isCommand
          ? undefined
          : statusSince(key, "removed", dumps),
      }),
    );
  }
  for (const key of curatedConvars.keys()) {
    if (!metas.has(key))
      throw new Error(
        `curated/convars.ts describes ${key}, which no source knows`,
      );
  }

  /**
   * ConVars entries the app writes by default, per category: active, not
   * denied, not a developer tool, and not the convar's own default for a key
   * stock doesn't set (the app counts that as unchanged).
   */
  const writableCounts = (entries: ConfigEntry[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      if (!isConvarEntry(entry) || entry.value === null) continue;
      const key = lowerName(entry.path);
      const meta = metas.get(key);
      if (!meta || (meta.status ?? "active") !== "active") continue;
      if (isDeniedConvar(meta.name) || meta.gameplay === "devtools") continue;
      if (
        !latestStock.parsed.convars.has(key) &&
        meta.default !== undefined &&
        meta.default !== null &&
        normalizeValue(entry.value) === normalizeValue(meta.default)
      )
        continue;
      counts[meta.category] = (counts[meta.category] ?? 0) + 1;
    }
    return Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => compareText(a, b)),
    );
  };

  const statusOf = (name: string) => {
    const meta = metas.get(name.toLowerCase());
    return meta ? (meta.status ?? "active") : "removed";
  };

  const presetFiles = new Set(
    PRESETS.map((preset) => preset.upstream).filter((id): id is string =>
      Boolean(id),
    ),
  );
  const unclassified = new Set<string>();
  for (const id of presetFiles) {
    for (const entry of upstream.get(id)?.delta.entries ?? []) {
      if (!isConvarEntry(entry)) continue;
      const key = lowerName(entry.path);
      if (!GAMEPLAY_PATTERNS.some((pattern) => pattern.test(key))) continue;
      if (GAMEPLAY.has(key) || ALLOW_IN_BODY.has(key) || isDeniedConvar(key))
        continue;
      unclassified.add(`${key} (${id})`);
    }
  }
  if (unclassified.size > 0) {
    throw new Error(
      `Unclassified gameplay convars in presets; add them to curated/gameplay.ts:\n  ${[...unclassified].sort().join("\n  ")}`,
    );
  }

  // Presets must be expressible as an overlay.
  for (const id of presetFiles) {
    const file = upstream.get(id);
    if (!file) continue;
    if (file.delta.skipped.listSection.length > 0) {
      throw new Error(
        `${id} edits list sections: ${file.delta.skipped.listSection.join(", ")}`,
      );
    }
    if (file.delta.unknownSections.length > 0) {
      throw new Error(
        `${id} edits sections stock doesn't have: ${file.delta.unknownSections.join(", ")}`,
      );
    }
  }

  const consensus = buildConsensus({ upstream, metas, latestStock, lines });

  const presets: CatalogPreset[] = PRESETS.map((definition) => {
    const base = {
      id: definition.id,
      name: definition.name,
      author: definition.author,
      tier: definition.tier,
      blurb: definition.blurb,
      highlights: definition.highlights,
      recommended: definition.recommended,
    };
    if (!definition.upstream) {
      return compact({
        ...base,
        baseBuild: latestStock.build,
        source: { kind: "bundled" as const },
        entries: consensus,
        notes: definition.notes,
      });
    }
    const file = UPSTREAM_FILES.find(
      (candidate) => candidate.id === definition.upstream,
    );
    const analyzed = upstream.get(definition.upstream);
    if (!file || !analyzed)
      throw new Error(
        `Preset ${definition.id}: unknown upstream ${definition.upstream}`,
      );
    const pin = pinOf(sources, file);
    return compact({
      ...base,
      version: pin.tag ?? file.versionPattern?.exec(analyzed.text)?.[1],
      updatedAt: pin.date,
      baseBuild: analyzed.base.build,
      source: {
        kind: "github" as const,
        repo: file.repo,
        path: file.path,
        commit: pin.commit,
        url: githubBlobUrl(file.repo, pin.commit, file.path),
        license: file.license,
      },
      entries: analyzed.delta.entries,
      videoSettings: analyzed.video ? videoSettings(analyzed.video) : undefined,
      notes: definition.notes,
    });
  });

  const communityConfigs: CatalogCommunityConfig[] = COMMUNITY.map(
    (definition) => {
      const pin = sources.community[String(definition.gamebananaId)];
      const analyzed = community.get(definition.id);
      if (!analyzed)
        throw new Error(
          `GameBanana ${definition.gamebananaId} was not analyzed`,
        );
      const categoryCounts = writableCounts(analyzed.delta.entries);
      const settingsCount = Object.values(categoryCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      return compact({
        id: definition.id,
        gamebananaId: definition.gamebananaId,
        name: pin.name,
        author: pin.author,
        downloads: pin.downloads,
        updatedAt: pin.updatedAt,
        tier: definition.tier,
        blurb: definition.blurb,
        baseBuild: analyzed.base.build,
        fileId: pin.fileId,
        variantHint: definition.variantHint,
        settingsCount,
        engineEditCount: analyzed.delta.entries.filter(
          (entry) => !isConvarEntry(entry),
        ).length,
        categoryCounts,
      });
    },
  );

  const convars = [...metas.values()].sort(
    (a, b) =>
      compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compareText(a.name, b.name),
  );

  const catalog: Catalog = {
    schemaVersion: SCHEMA_VERSION,
    version: "",
    generatedAt: "",
    latestBuild: latestStock.build,
    convarBuild: Math.max(...dumps.map((dump) => dump.build)),
    categories: CATEGORIES,
    sectionCategories: SECTION_CATEGORIES,
    convars,
    stock: stock.map((version) =>
      compact({
        build: version.build,
        date: version.date,
        pgiVersion: version.parsed.pgiVersion,
        entries: stockEntries(version.parsed),
      }),
    ),
    presets,
    community: communityConfigs,
    rules: RULES,
  };

  lines.push(
    `SchemaExplorer revision ${se.revision} (${se.versionDate}): ${facts.length} convars, ${commands.size} commands`,
    `Stock history: ${stock.length} builds, latest ${latestStock.build} (${latestStock.date})`,
    `Convars in catalog: ${convars.length} (blocked ${convars.filter((meta) => meta.status === "blocked").length}, removed ${convars.filter((meta) => meta.status === "removed").length}, notConvar ${convars.filter((meta) => meta.status === "notConvar").length}, curated ${convars.filter((meta) => meta.description).length})`,
  );
  for (const preset of presets) {
    const convarEntries = preset.entries.filter(isConvarEntry);
    const count = (status: string) =>
      convarEntries.filter((entry) => statusOf(entry.path[1]) === status)
        .length;
    const file =
      preset.source.kind === "github"
        ? upstream.get(PRESETS.find((p) => p.id === preset.id)?.upstream ?? "")
        : undefined;
    lines.push(
      `Preset ${preset.id}: ${preset.entries.length} entries (ConVars ${convarEntries.length}, engine ${preset.entries.length - convarEntries.length}, blocked ${count("blocked")}, removed ${count("removed")}, notConvar ${count("notConvar")}) base ${preset.baseBuild}${file ? (file.exact ? " (PGIVersion)" : " (closest)") : ""}${file ? `, skipped root ${file.delta.skipped.rootKey.length} excluded ${file.delta.skipped.excluded.length}` : ""}${preset.videoSettings ? `, video ${preset.videoSettings.length}` : ""}, cut ${cutScore(writableCounts(preset.entries)).toFixed(2)}`,
    );
  }
  for (const config of communityConfigs) {
    const analyzed = community.get(config.id);
    lines.push(
      `Community ${config.id} (${config.gamebananaId}/${config.fileId} ${analyzed?.variantPath}): settings ${config.settingsCount}, engine ${config.engineEditCount}, base ${config.baseBuild}${analyzed?.exact ? " (PGIVersion)" : ""}, cut ${cutScore(config.categoryCounts ?? {}).toFixed(2)}`,
    );
  }
  return { catalog, report: { lines } };
};

/**
 * The desktop's Looks ⟷ Frames placement (`cut_score_from_category_counts` in
 * perf_config/resolve.rs), for the report: each category saturates on its own.
 */
const cutScore = (counts: Record<string, number>): number => {
  const total = CATEGORIES.reduce(
    (sum, category) => sum + Math.max(0, category.weight),
    0,
  );
  let score = 0;
  for (const [category, count] of Object.entries(counts)) {
    const weight =
      CATEGORIES.find((entry) => entry.id === category)?.weight ?? 0;
    score += Math.max(0, weight) * (1 - Math.exp(-count / 4));
  }
  return total === 0 ? 0 : Math.min(1, score / total);
};

const buildConsensus = ({
  upstream,
  metas,
  latestStock,
  lines,
}: {
  upstream: Map<string, AnalyzedFile>;
  metas: Map<string, ConvarMeta>;
  latestStock: StockVersion;
  lines: string[];
}): ConfigEntry[] => {
  const lineages = new Map<string, string[]>();
  for (const file of UPSTREAM_FILES) {
    lineages.set(file.lineage, [
      ...(lineages.get(file.lineage) ?? []),
      file.id,
    ]);
  }

  // Each lineage's value per key: the majority among its configs, first config on a tie.
  const votes = new Map<string, Map<string, string>>();
  for (const [lineage, ids] of lineages) {
    const perKey = new Map<string, string[]>();
    for (const id of ids) {
      for (const entry of upstream.get(id)?.delta.entries ?? []) {
        if (
          !isConvarEntry(entry) ||
          entry.path.length !== 2 ||
          entry.value === null
        )
          continue;
        const key = lowerName(entry.path);
        perKey.set(key, [
          ...(perKey.get(key) ?? []),
          normalizeValue(entry.value),
        ]);
      }
    }
    for (const [key, values] of perKey) {
      const counts = new Map<string, number>();
      for (const value of values)
        counts.set(value, (counts.get(value) ?? 0) + 1);
      let best = values[0];
      for (const value of values)
        if ((counts.get(value) ?? 0) > (counts.get(best) ?? 0)) best = value;
      const keyVotes = votes.get(key) ?? new Map<string, string>();
      keyVotes.set(lineage, best);
      votes.set(key, keyVotes);
    }
  }

  const dropped = {
    notActive: 0,
    gameplay: 0,
    menu: 0,
    hides: 0,
    range: 0,
    stock: 0,
  };
  const entries: ConfigEntry[] = [];
  for (const [key, keyVotes] of [...votes].sort(([a], [b]) =>
    compareText(a, b),
  )) {
    const tally = new Map<string, number>();
    for (const value of keyVotes.values())
      tally.set(value, (tally.get(value) ?? 0) + 1);
    const [mode, modeCount] = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || compareText(a[0], b[0]),
    )[0];
    if (modeCount < MIN_LINEAGES || modeCount / keyVotes.size < MIN_AGREEMENT)
      continue;
    const meta = metas.get(key);
    if (!meta || (meta.status ?? "active") !== "active") {
      dropped.notActive += 1;
      continue;
    }
    if (meta.gameplay || meta.category === "camera" || isDeniedConvar(key)) {
      dropped.gameplay += 1;
      continue;
    }
    if (VIDEO_MENU.has(key)) {
      dropped.menu += 1;
      continue;
    }
    if (HIDES_THINGS.some((rule) => rule.pattern.test(key))) {
      dropped.hides += 1;
      continue;
    }
    if (isNumeric(mode)) {
      const value = Number(mode);
      if (
        (meta.min !== undefined && meta.min !== null && value < meta.min) ||
        (meta.max !== undefined && meta.max !== null && value > meta.max)
      ) {
        dropped.range += 1;
        continue;
      }
    }
    const stockValue = latestStock.parsed.convars.get(key);
    const reference =
      stockValue && !stockValue.object ? stockValue.value : meta.default;
    if (
      reference !== undefined &&
      reference !== null &&
      normalizeValue(reference) === mode
    ) {
      dropped.stock += 1;
      continue;
    }
    const value =
      meta.kind === "bool" && (mode === "0" || mode === "1")
        ? mode === "1"
          ? "true"
          : "false"
        : mode;
    entries.push({ path: ["ConVars", meta.name], value });
  }
  lines.push(
    `DMM Clean: ${entries.length} entries from ${lineages.size} lineages (${[...lineages.keys()].join(", ")}); dropped: not active ${dropped.notActive}, gameplay/camera/denied ${dropped.gameplay}, video menu ${dropped.menu}, hides things ${dropped.hides}, out of range ${dropped.range}, same as stock ${dropped.stock}`,
  );
  return entries;
};
