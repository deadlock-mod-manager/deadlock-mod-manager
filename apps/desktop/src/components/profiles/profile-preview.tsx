import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { DialogFooter } from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Download, Package, UserPlus, Volume2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { ImportProgress } from "@/hooks/use-profile-import";

const ProfileModCard = ({ mod }: { mod: ModDto }) => {
  const { t } = useTranslation();
  const image = mod.images && mod.images.length > 0 ? mod.images[0] : mod.hero;
  const isSoundMod = mod.isAudio;

  return (
    <div className='flex items-center justify-between rounded-lg border p-3'>
      <div className='flex items-center gap-3'>
        {image && !isSoundMod && (
          <img
            className='h-10 w-10 rounded bg-muted'
            src={image}
            alt={mod.name}
            width={40}
            height={40}
          />
        )}
        {isSoundMod && (
          <div className='h-10 w-10 rounded bg-muted flex items-center justify-center'>
            <Volume2 className='h-5 w-5 text-muted-foreground' />
          </div>
        )}
        <div>
          <p className='font-medium text-sm'>{mod.name}</p>
          <p className='text-muted-foreground text-xs'>
            {t("by", { ns: "common" })} {mod.author}
          </p>
        </div>
      </div>

      <Badge className='h-5 rounded-full text-xs' variant='secondary'>
        {mod.category}
      </Badge>
    </div>
  );
};

const ModCardSkeleton = () => (
  <div className='flex items-center justify-between rounded-lg border p-3'>
    <div className='flex items-center gap-3'>
      <Skeleton className='h-10 w-10 rounded' />
      <div className='space-y-1'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-3 w-20' />
      </div>
    </div>

    <Skeleton className='h-5 w-16 rounded-full' />
  </div>
);

const FallbackModCard = ({ mod }: { mod: { remoteId: string } }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3'>
      <div className='flex items-center gap-3'>
        <div className='h-10 w-10 rounded bg-destructive/20' />
        <div>
          <p className='font-medium text-sm text-destructive'>
            {t("profiles.modNotFound")}
          </p>
          <p className='text-muted-foreground text-xs'>ID: {mod.remoteId}</p>
        </div>
      </div>

      <Badge variant='destructive' className='h-5 rounded-full text-xs'>
        {t("common.error")}
      </Badge>
    </div>
  );
};

const ModsList = ({
  importedProfile,
  modsLoading,
  modsData,
}: {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
}) => {
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
          <ModCardSkeleton key='skeleton-1' />
          <ModCardSkeleton key='skeleton-2' />
          <ModCardSkeleton key='skeleton-3' />
        </>
      )}

      {!modsLoading &&
        availableMods.map((mod) => <ProfileModCard key={mod.id} mod={mod} />)}

      {!modsLoading &&
        failedMods.length > 0 &&
        failedMods.map((mod) => (
          <FallbackModCard key={mod.remoteId} mod={mod} />
        ))}
    </>
  );
};

interface ProfilePreviewProps {
  importedProfile: SharedProfile;
  modsLoading: boolean;
  modsData: ModDto[];
  onCreateNew: () => void;
  onOverride: () => void;
  onCancel: () => void;
  isImporting: boolean;
  importProgress: ImportProgress | null;
  selectedAction: "create" | "override" | null;
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
          <ModsList
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
