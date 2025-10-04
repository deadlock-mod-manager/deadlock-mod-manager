import { Button } from "@deadlock-mods/ui/components/button";
import { useState } from "react";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager-dialog";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { usePersistedStore } from "@/lib/store";

const Profile = () => {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const { getActiveProfile } = usePersistedStore();
  const activeProfile = getActiveProfile();
  const { isEnabled: isProfileManagementEnabled } =
    useFeatureFlag("profile-management");

  return (
    <>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='font-bold text-sm'>
          {activeProfile?.name || "Default"}
        </h3>
        {isProfileManagementEnabled && (
          <Button
            className='text-xs'
            onClick={() => setShowProfileManager(true)}
            size='text'
            variant='text'>
            Change profile
          </Button>
        )}
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
