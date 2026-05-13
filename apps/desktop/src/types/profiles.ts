import type { LocalMod } from "@/types/mods";

export type ProfileId = string & { readonly __brand: unique symbol };

export interface ModProfileEntry {
  remoteId: string;
  enabled: boolean;
  lastModified: Date;
}

export interface ModProfile {
  id: ProfileId;
  name: string;
  description?: string;
  createdAt: Date;
  lastUsed?: Date;
  enabledMods: Record<string, ModProfileEntry>;
  isDefault: boolean;
  folderName: string | null;
  mods: LocalMod[];
}

export interface VpkManifestEntry {
  enabled: boolean;
  order?: number | null;
  currentVpks: string[];
  disabledVpks: string[];
  originalVpkNames: string[];
}

export interface VpkManifest {
  version: number;
  mods: Record<string, VpkManifestEntry>;
}

export interface SeedManifestEntry {
  modId: string;
  enabled: boolean;
  currentVpks: string[];
  disabledVpks: string[];
  originalVpkNames: string[];
  order: number | null;
}

export interface ProfileSwitchResult {
  disabledMods: string[];
  enabledMods: string[];
  errors: string[];
}

export const createProfileId = (id: string): ProfileId => id as ProfileId;

export const DEFAULT_PROFILE_NAME = "Default Profile";

export const DEFAULT_PROFILE_ID = createProfileId("default");
