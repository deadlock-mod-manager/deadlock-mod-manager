import {
  getOrderedSharedProfileMods,
  type ModDto,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { useTranslation } from "react-i18next";
import { ProfileFallbackModCard } from "./profile-fallback-mod-card";
import { ProfileModCard } from "./profile-mod-card";
import { ProfileModCardSkeleton } from "./profile-mod-card-skeleton";

interface ProfileModsListProps {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
}

export const ProfileModsList = ({
  importedProfile,
  modsLoading,
  modsData,
}: ProfileModsListProps) => {
  const { t } = useTranslation();
  const orderedImportedMods = getOrderedSharedProfileMods(importedProfile);

  if (orderedImportedMods.length === 0) {
    return (
      <p className='text-center text-muted-foreground text-sm'>
        {t("profiles.noModsIncluded")}
      </p>
    );
  }

  const availableModsByRemoteId = new Map(
    modsData.map((mod) => [mod.remoteId, mod]),
  );
  const availableMods = orderedImportedMods
    .map((mod) => availableModsByRemoteId.get(mod.remoteId))
    .filter((mod): mod is ModDto => mod !== undefined);

  const failedMods = orderedImportedMods.filter(
    (mod) => !availableModsByRemoteId.has(mod.remoteId),
  );

  return (
    <>
      {modsLoading && (
        <>
          <ProfileModCardSkeleton key='skeleton-1' />
          <ProfileModCardSkeleton key='skeleton-2' />
          <ProfileModCardSkeleton key='skeleton-3' />
        </>
      )}

      {!modsLoading &&
        availableMods.map((mod) => <ProfileModCard key={mod.id} mod={mod} />)}

      {!modsLoading &&
        failedMods.length > 0 &&
        failedMods.map((mod) => (
          <ProfileFallbackModCard key={mod.remoteId} mod={mod} />
        ))}
    </>
  );
};
