import { z } from "zod";

/**
 * Shape of `data/catalog.json`. The desktop app deserializes the same file in
 * Rust (`apps/desktop/src-tauri/src/mod_manager/perf_config/catalog.rs`), so a
 * change here needs the matching change there and a bump of SCHEMA_VERSION in
 * both places.
 */
export const SCHEMA_VERSION = 1;

const configEntrySchema = z.object({
  /** Path below the `GameInfo` root, e.g. `["ConVars", "r_ssao"]`. */
  path: z.array(z.string()).min(1),
  /** Raw value without quotes; `null` comments the key out. */
  value: z.string().nullable(),
});

const perfTierSchema = z.enum([
  "pretty",
  "balanced",
  "lean",
  "sweaty",
  "potato",
]);

const gameplayClassSchema = z.enum(["camera", "visibility", "devtools"]);

const convarKindSchema = z.enum([
  "bool",
  "int",
  "float",
  "string",
  "enum",
  "color",
  "vector",
]);

const convarStatusSchema = z.enum([
  "active",
  "blocked",
  "removed",
  "notConvar",
]);

const convarMetaSchema = z.object({
  name: z.string(),
  kind: convarKindSchema,
  default: z.string().nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  step: z.number().nullable().optional(),
  enumValues: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  flags: z.array(z.string()).optional(),
  help: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string(),
  gameplay: gameplayClassSchema.nullable().optional(),
  sideEffects: z.string().nullable().optional(),
  status: convarStatusSchema.optional(),
  statusSinceBuild: z.number().int().nullable().optional(),
});

const categorySchema = z.object({
  id: z.string(),
  label: z.string(),
  /** How much turning things off in this category moves the Looks ⟷ Frames scale. */
  weight: z.number().min(0),
});

const stockBuildSchema = z.object({
  build: z.number().int(),
  date: z.string(),
  pgiVersion: z.string().nullable().optional(),
  entries: z.array(configEntrySchema),
});

const videoSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  label: z.string().nullable().optional(),
  display: z.string().nullable().optional(),
});

const presetSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("github"),
    repo: z.string(),
    path: z.string(),
    commit: z.string(),
    url: z.string(),
    license: z.string(),
  }),
  z.object({ kind: z.literal("bundled") }),
]);

const catalogPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  author: z.string(),
  tier: perfTierSchema,
  blurb: z.string(),
  highlights: z.array(z.string()).optional(),
  recommended: z.boolean().optional(),
  version: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  baseBuild: z.number().int().nullable().optional(),
  source: presetSourceSchema,
  /** The author's changes relative to `baseBuild`, not a whole file. */
  entries: z.array(configEntrySchema),
  videoSettings: z.array(videoSettingSchema).optional(),
  notes: z.array(z.string()).optional(),
});

const catalogCommunityConfigSchema = z.object({
  id: z.string(),
  gamebananaId: z.number().int(),
  name: z.string(),
  author: z.string(),
  downloads: z.number().int().optional(),
  updatedAt: z.string().nullable().optional(),
  tier: perfTierSchema,
  blurb: z.string(),
  baseBuild: z.number().int().nullable().optional(),
  fileId: z.number().int(),
  variantHint: z.string().nullable().optional(),
  settingsCount: z.number().int().optional(),
  engineEditCount: z.number().int().optional(),
  categoryCounts: z.record(z.string(), z.number().int()).optional(),
});

const deniedRuleSchema = z.object({
  path: z.array(z.string()).nullable().optional(),
  pattern: z.string().nullable().optional(),
  reason: z.string(),
});

const catalogRulesSchema = z.object({
  excludedSections: z.array(z.string()),
  guardedSections: z.array(z.string()),
  denied: z.array(deniedRuleSchema).optional(),
});

export const catalogSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Sortable revision: `YYYY.MM.DD-N`. */
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/),
  generatedAt: z.string(),
  latestBuild: z.number().int().nullable().optional(),
  /** Newest game build in the convar dump history: what convar statuses describe. */
  convarBuild: z.number().int().nullable().optional(),
  categories: z.array(categorySchema),
  sectionCategories: z.record(z.string(), z.string()).optional(),
  convars: z.array(convarMetaSchema),
  /** Valve's stock files, newest first. */
  stock: z.array(stockBuildSchema).optional(),
  presets: z.array(catalogPresetSchema).optional(),
  community: z.array(catalogCommunityConfigSchema).optional(),
  rules: catalogRulesSchema,
});

export type ConfigEntry = z.infer<typeof configEntrySchema>;
export type PerfTier = z.infer<typeof perfTierSchema>;
export type ConvarMeta = z.infer<typeof convarMetaSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CatalogPreset = z.infer<typeof catalogPresetSchema>;
export type CatalogCommunityConfig = z.infer<
  typeof catalogCommunityConfigSchema
>;
export type CatalogRules = z.infer<typeof catalogRulesSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
