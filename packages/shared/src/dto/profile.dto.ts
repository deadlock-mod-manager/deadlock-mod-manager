import type { Profile } from "@deadlock-mods/database";
import type { SharedProfile } from "../schemas/profile.schemas";

export const toProfileDto = (profile: Profile) => {
  return profile.profile as SharedProfile;
};

export type ProfileDto = ReturnType<typeof toProfileDto>;
