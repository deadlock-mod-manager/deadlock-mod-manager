import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { DialogFooter } from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Download, Package, UserPlus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { ImportProgress } from "@/hooks/use-profile-import";
import { ProfileModsList } from "./profile-mods-list";

interface ProfilePreviewProps {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
  onCreateNew: () => void;
  onCancel: () => void;
  isImporting: boolean;
  importProgress: ImportProgress | null;
}

export const ProfilePreview = ({
  importedProfile,
  modsLoading,
  modsData,
  onCreateNew,
  onCancel,
  isImporting,
  importProgress,
}: ProfilePreviewProps) => {
  const { t } = useTranslation();

  // Calculate progress percentage
  const progressPercentage = importProgress
    ? Math.min(
        100,
        Math.max(
          0,
          importProgress.totalMods > 0
            ? (importProgress.completedMods / importProgress.totalMods) * 100
            : 0,
        ),
      )
    : 0;

  // Determine current step info
  const isDownloading = importProgress?.isDownloading ?? false;
  const isInstalling = importProgress?.isInstalling ?? false;
  const currentStepText = isDownloading
    ? t("profiles.downloadingMods", { defaultValue: "Downloading mods..." })
    : isInstalling
      ? t("profiles.installingMods", { defaultValue: "Installing mods..." })
      : importProgress?.currentStep || "";

  const StepIcon = isDownloading ? Download : isInstalling ? Package : null;

  return (
    <>
      {isImporting && importProgress ? (
        <div className='space-y-4'>
          <div className='space-y-2'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center gap-2'>
                {StepIcon && (
                  <StepIcon className='h-4 w-4 text-muted-foreground' />
                )}
                <span className='font-medium'>{currentStepText}</span>
              </div>
              <span className='text-muted-foreground'>
                {importProgress.completedMods} / {importProgress.totalMods}
              </span>
            </div>
            <Progress value={progressPercentage} className='h-2' />
            {importProgress.currentMod && (
              <p className='text-sm text-muted-foreground'>
                {importProgress.currentMod}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className='space-y-4 max-h-64 overflow-y-auto'>
          <ProfileModsList
            importedProfile={importedProfile}
            modsLoading={modsLoading}
            modsData={modsData}
          />
        </div>
      )}
      <DialogFooter>
        <Button
          onClick={onCreateNew}
          className='justify-start'
          disabled={isImporting}>
          <UserPlus className='h-4 w-4 mr-2' />
          {t("profiles.createNewProfile")}
        </Button>
        <Button variant='outline' onClick={onCancel} disabled={isImporting}>
          {t("common.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
};
