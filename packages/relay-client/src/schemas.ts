import { z } from "zod";

export const ModRequirementSchema = z.object({
  name: z.string(),
  version: z.string().optional().default(""),
});

export const ModInfoSchema = z.object({
  name: z.string(),
  version: z.string().optional().default(""),
});

export const PlayerInfoSchema = z.object({
  name: z.string(),
  hero: z.string().optional().default(""),
  team: z.number().int().optional().default(0),
  kills: z.number().int().optional().default(0),
  deaths: z.number().int().optional().default(0),
  assists: z.number().int().optional().default(0),
  level: z.number().int().optional().default(0),
});

export const VisibilitySchema = z.enum([
  "public",
  "unlisted",
  "private",
  "password",
]);

export const AuthProviderSchema = z.object({
  type: z.enum(["discord", "steam", "password", "custom"]),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ServerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  ip: z.string().optional().default(""),
  port: z.number().int(),
  visibility: VisibilitySchema.catch("public"),
  password_protected: z.boolean().optional().default(false),
  connect_code: z.string().optional().default(""),
  gateway_url: z.string().optional().default(""),
  player_count: z.number().int().optional().default(0),
  max_players: z.number().int(),
  map: z.string().optional().default(""),
  game_mode: z.string().optional().default(""),
  version: z.string().optional().default(""),
  players: z.array(PlayerInfoSchema).optional().default([]),
  mods: z.array(ModInfoSchema).optional().default([]),
  required_mods: z.array(ModRequirementSchema).optional().default([]),
  last_seen: z.string(),
  auth_required: z.boolean().optional().default(false),
  auth_providers: z.array(AuthProviderSchema).optional().default([]),
  auth_public_key: z.string().optional(),
  auth_prompt_message: z.string().optional(),
  auth_prompt_url: z.string().optional(),
});

export const ServersResponseSchema = z.object({
  servers: z.array(ServerListItemSchema),
});

export const RelayPeerSchema = z.object({
  url: z.string(),
  region: z.string().optional(),
  server_count: z.number().int().optional(),
  last_seen: z.string().optional(),
});

export const RelaysResponseSchema = z.object({
  relays: z.array(RelayPeerSchema),
});

export const RelaysManifestEntrySchema = z.object({
  url: z.string().url(),
  region: z.string().optional(),
});

export const RelaysManifestSchema = z.object({
  version: z.literal(1),
  relays: z.array(RelaysManifestEntrySchema),
});

export type ModRequirement = z.infer<typeof ModRequirementSchema>;
export type ModInfo = z.infer<typeof ModInfoSchema>;
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export type ServerListItem = z.infer<typeof ServerListItemSchema>;
export type ServersResponse = z.infer<typeof ServersResponseSchema>;
export type RelayPeer = z.infer<typeof RelayPeerSchema>;
export type RelaysResponse = z.infer<typeof RelaysResponseSchema>;
export type RelaysManifest = z.infer<typeof RelaysManifestSchema>;
export type RelaysManifestEntry = z.infer<typeof RelaysManifestEntrySchema>;
