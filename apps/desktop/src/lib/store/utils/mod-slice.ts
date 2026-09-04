import type { LocalMod } from "@/types/mods";
import type { ProfileId } from "@/types/profiles";
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

export const applyToModsInProfile = (
  state: ModSliceState,
  profileId: ProfileId,
  updateMods: (mods: LocalMod[]) => LocalMod[],
) => {
  const profile = state.profiles[profileId];

  if (!profile) {
    return {
      localMods: state.localMods,
      profiles: state.profiles,
    };
  }

  const profileMods = updateMods(profile.mods);

  return {
    localMods:
      state.activeProfileId === profileId ? profileMods : state.localMods,
    profiles: {
      ...state.profiles,
      [profileId]: {
        ...profile,
        mods: profileMods,
      },
    },
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
