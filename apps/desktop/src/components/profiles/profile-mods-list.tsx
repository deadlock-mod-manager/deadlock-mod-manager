import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
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

  if (importedProfile.payload.mods.length === 0) {
    return (
      <p className='text-center text-muted-foreground text-sm'>
        {t("profiles.noModsIncluded")}
      </p>
    );
  }

  const availableMods = modsData.filter((mod) =>
    importedProfile.payload.mods.some((m) => m.remoteId === mod.remoteId),
  );

  const failedMods = importedProfile.payload.mods.filter(
    (mod) => !modsData.some((m) => m.remoteId === mod.remoteId),
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
