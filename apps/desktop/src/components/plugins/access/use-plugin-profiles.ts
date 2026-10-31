import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_PROFILE_FOLDER } from "@/lib/external-plugins";
import { usePersistedStore } from "@/lib/store";
import type { ProfileId } from "@/types/profiles";

/** A profile a plugin may be given, by the folder its grant stores. */
type PluginProfile = {
  id: ProfileId;
  name: string;
  folderName: string;
};

/** Profiles a plugin may be given, and a lookup from a granted folder to its name.
 * `testProfiles` are the non-default ones, the only kind a plugin may install into. */
export const usePluginProfiles = () => {
  const { t } = useTranslation();
  const profiles = usePersistedStore((state) => state.profiles);

  return useMemo(() => {
    const all = Object.values(profiles);
    const testProfiles = all.flatMap((profile): PluginProfile[] =>
      !profile.isDefault && profile.folderName
        ? [
            {
              id: profile.id,
              name: profile.name,
              folderName: profile.folderName,
            },
          ]
        : [],
    );
    const defaultEntry = all.find((profile) => profile.isDefault);
    const defaultProfile: PluginProfile | null = defaultEntry
      ? {
          id: defaultEntry.id,
          name: defaultEntry.name,
          folderName: DEFAULT_PROFILE_FOLDER,
        }
      : null;
    const findProfileName = (folder: string) =>
      folder === DEFAULT_PROFILE_FOLDER
        ? (defaultProfile?.name ?? null)
        : (all.find((profile) => profile.folderName === folder)?.name ?? null);
    const profileName = (folder: string) =>
      findProfileName(folder) ??
      t("plugins.access.actions.unknownProfile", { folder });
    return { testProfiles, defaultProfile, findProfileName, profileName };
  }, [profiles, t]);
};
