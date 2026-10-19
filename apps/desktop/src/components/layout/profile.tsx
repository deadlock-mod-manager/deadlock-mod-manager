import { CaretUpDownIcon } from "@phosphor-icons/react";
import { Users } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager-dialog";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const PROFILES_HINT_MIN_MODS = 15;

const Profile = () => {
  const { t } = useTranslation();
  const [showProfileManager, setShowProfileManager] = useState(false);
  const { getActiveProfile } = usePersistedStore();
  const activeProfile = getActiveProfile();
  const isProfileManagementEnabled =
    useExperimentalFeature("profile-management");
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const profilesHintEligible = usePersistedStore(
    (state) =>
      state.localMods.length >= PROFILES_HINT_MIN_MODS &&
      Object.keys(state.profiles).length === 1,
  );

  const openProfileManager = () => {
    setShowProfileManager(true);
    markFeatureUsed("profiles");
  };

  const profileName =
    activeProfile?.name || t("profiles.default", "Default Profile");

  return (
    <>
      <HintAnchor
        align='start'
        eligible={isProfileManagementEnabled && profilesHintEligible}
        hintId='profiles'
        onShowMe={openProfileManager}>
        <button
          aria-label={t("profiles.activeProfile", "Active Profile")}
          className={cn(
            "group/profile relative flex h-full min-w-0 items-center gap-2 rounded-l-md px-2.5 text-left",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isProfileManagementEnabled
              ? "cursor-pointer hover:bg-primary/[0.06]"
              : "cursor-default",
          )}
          disabled={!isProfileManagementEnabled}
          onClick={openProfileManager}
          type='button'>
          <Users className='size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/profile:text-primary' />

          <span className='truncate font-primary text-sm leading-none tracking-wide text-foreground'>
            {profileName}
          </span>

          {isProfileManagementEnabled && (
            <CaretUpDownIcon
              className='size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover/profile:text-primary'
              weight='bold'
            />
          )}
        </button>
      </HintAnchor>

      {isProfileManagementEnabled && (
        <ProfileManagerDialog
          open={showProfileManager}
          onOpenChange={setShowProfileManager}
        />
      )}
    </>
  );
};

export default Profile;
