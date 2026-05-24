import type { LocalMod } from "@/types/mods";
import type { State } from "..";

export type ModSliceState = Pick<
  State,
  "localMods" | "profiles" | "activeProfileId"
>;

export const applyToModsAndActiveProfile = (
  state: ModSliceState,
  updateMods: (mods: LocalMod[]) => LocalMod[],
) => {
  const activeProfile = state.profiles[state.activeProfileId];

  return {
    localMods: updateMods(state.localMods),
    profiles: activeProfile
      ? {
          ...state.profiles,
          [state.activeProfileId]: {
            ...activeProfile,
            mods: updateMods(activeProfile.mods),
          },
        }
      : state.profiles,
  };
};

export const applyToModsAndAllProfiles = (
  state: ModSliceState,
  updateMods: (mods: LocalMod[]) => LocalMod[],
) => {
  return {
    localMods: updateMods(state.localMods),
    profiles: Object.fromEntries(
      Object.entries(state.profiles).map(([profileId, profile]) => [
        profileId,
        {
          ...profile,
          mods: updateMods(profile.mods),
        },
      ]),
    ),
  };
};
