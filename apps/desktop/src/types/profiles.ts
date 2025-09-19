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
}

export interface ProfileSwitchResult {
  disabledMods: string[];
  enabledMods: string[];
  errors: string[];
}

export const createProfileId = (id: string): ProfileId => id as ProfileId;

export const DEFAULT_PROFILE_NAME = "Default Profile";

export const DEFAULT_PROFILE_ID = createProfileId("default");
