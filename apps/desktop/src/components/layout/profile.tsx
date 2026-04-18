import { CaretDownIcon } from "@phosphor-icons/react";
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
      <div className='flex min-w-0 flex-col gap-1'>
        <p className='font-medium text-[10px] uppercase tracking-[0.08em] text-muted-foreground leading-none'>
          {t("profiles.activeProfile", "Active Profile")}
        </p>
        <button
          className={cn(
            "group inline-flex min-w-0 items-center gap-1.5 rounded-sm text-left",
            "font-semibold text-sm leading-none",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isProfileManagementEnabled
              ? "cursor-pointer hover:text-primary"
              : "cursor-default",
          )}
          disabled={!isProfileManagementEnabled}
          onClick={() => setShowProfileManager(true)}
          type='button'>
          <span className='truncate'>{profileName}</span>
          {isProfileManagementEnabled && (
            <CaretDownIcon
              className='size-3 shrink-0 text-muted-foreground transition-transform group-hover:text-primary'
              weight='bold'
            />
          )}
        </button>
      </div>

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
