import { z } from "zod";

const ModProviderSchema = z.enum(["gamebanana", "custom"]);

const ModRequirementSchema = z.object({
  id: z.string(),
  provider: ModProviderSchema,
  url: z.string(),
  version: z.string().optional(),
});

const ModInfoSchema = z.object({
  name: z.string(),
  version: z.string().default(""),
});

const PlayerInfoSchema = z.object({
  name: z.string(),
  hero: z.string().default(""),
  team: z.number().int().default(0),
  kills: z.number().int().default(0),
  deaths: z.number().int().default(0),
  assists: z.number().int().default(0),
  level: z.number().int().default(0),
});

const VisibilitySchema = z.enum(["public", "unlisted", "private", "password"]);

const AuthProviderSchema = z.object({
  type: z.enum(["discord", "steam", "password", "custom"]),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ServerBrowserEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string().default(""),
  port: z.number().int(),
  visibility: VisibilitySchema,
  password_protected: z.boolean().default(false),
  connect_code: z.string().default(""),
  gateway_url: z.string().default(""),
  player_count: z.number().int().default(0),
  max_players: z.number().int(),
  map: z.string().default(""),
  game_mode: z.string().default(""),
  version: z.string().default(""),
  players: z.array(PlayerInfoSchema).default([]),
  mods: z.array(ModInfoSchema).default([]),
  required_mods: z.array(ModRequirementSchema).default([]),
  last_seen: z.string(),
  auth_required: z.boolean().default(false),
  auth_providers: z.array(AuthProviderSchema).default([]),
  auth_public_key: z.string().optional(),
  auth_prompt_message: z.string().optional(),
  auth_prompt_url: z.string().optional(),
  source_relay: z.string(),
  source_region: z.string().optional(),
});

const queryBooleanOptional = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"))
  .optional();

export const ServerBrowserListInputSchema = z.object({
  game_mode: z.string().optional(),
  has_players: queryBooleanOptional,
  search: z.string().optional(),
  region: z.string().optional(),
  password: queryBooleanOptional,
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});

export const ServerBrowserListResponseSchema = z.object({
  servers: z.array(ServerBrowserEntrySchema),
  total: z.number().int(),
  cursor: z.number().int().nullable(),
  relays_queried: z.number().int(),
  relays_failed: z.number().int(),
});

export const ServerBrowserFacetsResponseSchema = z.object({
  game_modes: z.array(z.string()),
  regions: z.array(z.string()),
  relays_queried: z.number().int(),
  relays_failed: z.number().int(),
});

export const ServerBrowserIdParamSchema = z.object({
  id: z.string(),
});

export const RelayHealthSchema = z.object({
  url: z.string(),
  region: z.string().optional(),
  healthy: z.boolean(),
  consecutiveFailures: z.number().int(),
  lastSuccessAt: z.string().optional(),
  lastErrorAt: z.string().optional(),
  lastLatencyMs: z.number().optional(),
  lastError: z.string().optional(),
});

export const RelaysHealthResponseSchema = z.object({
  relays: z.array(RelayHealthSchema),
});

export type ServerBrowserEntry = z.infer<typeof ServerBrowserEntrySchema>;
export type ServerBrowserListInput = z.infer<
  typeof ServerBrowserListInputSchema
>;
export type ServerBrowserListResponse = z.infer<
  typeof ServerBrowserListResponseSchema
>;
export type ServerBrowserFacetsResponse = z.infer<
  typeof ServerBrowserFacetsResponseSchema
>;
export type RelayHealth = z.infer<typeof RelayHealthSchema>;
export type RelaysHealthResponse = z.infer<typeof RelaysHealthResponseSchema>;
export type ServerRequiredMod = z.infer<typeof ModRequirementSchema>;
export type ServerModProvider = z.infer<typeof ModProviderSchema>;
export type ServerPlayer = z.infer<typeof PlayerInfoSchema>;

export const ResolvedRequirementSchema = z.object({
  name: z.string(),
  provider: ModProviderSchema,
  url: z.string(),
  version: z.string().optional(),
  resolved: z.boolean(),
  remoteId: z.string().optional(),
  reason: z
    .enum(["unknown_scheme", "not_in_database", "custom_provider"])
    .optional(),
  mod: z.unknown().optional(),
});

export const ResolveModsInputSchema = z.object({
  required_mods: z.array(ModRequirementSchema),
});

export const ResolveModsResponseSchema = z.object({
  resolved: z.array(ResolvedRequirementSchema),
  missing: z.array(ResolvedRequirementSchema),
});

export type ResolvedRequirement = z.infer<typeof ResolvedRequirementSchema>;
export type ResolveModsInput = z.infer<typeof ResolveModsInputSchema>;
export type ResolveModsResponse = z.infer<typeof ResolveModsResponseSchema>;
