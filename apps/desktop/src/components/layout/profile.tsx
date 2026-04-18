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
        className={cn(
          "group inline-flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left",
          "border border-transparent text-xs leading-none",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isProfileManagementEnabled
            ? "cursor-pointer hover:border-border hover:bg-secondary/50"
            : "cursor-default",
        )}
        disabled={!isProfileManagementEnabled}
        onClick={() => setShowProfileManager(true)}
        type='button'>
        <Users className='size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground' />
        <span className='truncate font-medium'>{profileName}</span>
        {isProfileManagementEnabled && (
          <CaretUpDownIcon
            className='size-3 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground'
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
