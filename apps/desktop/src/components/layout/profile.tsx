import { useState } from "react";
import { ProfileManagerDialog } from "@/components/profiles/profile-manager-dialog";
import { Button } from "@/components/ui/button";
import { usePersistedStore } from "@/lib/store";

const Profile = () => {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const { getActiveProfile } = usePersistedStore();
  const activeProfile = getActiveProfile();

  return (
    <>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='font-bold text-sm'>
          {activeProfile?.name || "Default"}
        </h3>
        <Button
          className='text-xs'
          onClick={() => setShowProfileManager(true)}
          size='text'
          variant='text'>
          Change profile
        </Button>
      </div>

      <ProfileManagerDialog
        open={showProfileManager}
        onOpenChange={setShowProfileManager}
      />
    </>
  );
};

export default Profile;
