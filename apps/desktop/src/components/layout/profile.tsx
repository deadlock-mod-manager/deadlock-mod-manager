import { CaretUpDownIcon } from "@phosphor-icons/react";
import { Users } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager-dialog";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const Profile = () => {
  const { t } = useTranslation();
  const [showProfileManager, setShowProfileManager] = useState(false);
  const { getActiveProfile } = usePersistedStore();
  const activeProfile = getActiveProfile();
  const { isEnabled: isProfileManagementEnabled } =
    useFeatureFlag("profile-management");

  const profileName =
    activeProfile?.name || t("profiles.default", "Default Profile");

  return (
    <>
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
        onClick={() => setShowProfileManager(true)}
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
