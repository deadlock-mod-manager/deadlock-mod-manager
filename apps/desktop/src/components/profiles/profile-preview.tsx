import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
import { Save, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ImportProgress } from "@/hooks/use-profile-import";
import { ImportProgressDisplay } from "./import-progress";

const ProfileModCard = ({ mod }: { mod: ModDto }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between rounded-lg border p-3'>
      <div className='flex items-center gap-3'>
        <div className='h-10 w-10 rounded bg-muted' />
        <div>
          <p className='font-medium text-sm'>{mod.name}</p>
          <p className='text-muted-foreground text-xs'>
            {t("common.by")} {mod.author}
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

const ImportOptions = ({
  onCreateNew,
  onOverride,
  isImporting,
  importProgress,
  selectedAction,
}: {
  onCreateNew: () => void;
  onOverride: () => void;
  isImporting: boolean;
  importProgress: ImportProgress | null;
  selectedAction: "create" | "override" | null;
}) => {
  const { t } = useTranslation();

  // Show progress if importing
  if (isImporting && importProgress) {
    return <ImportProgressDisplay progress={importProgress} />;
  }

  return (
    <div>
      <p className='text-sm text-muted-foreground mb-3'>
        {t("profiles.importOptionsDescription")}
      </p>
      <div className='flex flex-col gap-2'>
        {(!selectedAction || selectedAction === "create") && (
          <Button
            onClick={onCreateNew}
            className='justify-start'
            variant={selectedAction === "create" ? "default" : "outline"}
            disabled={isImporting}>
            <UserPlus className='h-4 w-4 mr-2' />
            {t("profiles.createNewProfile")}
          </Button>
        )}
        {(!selectedAction || selectedAction === "override") && (
          <Button
            onClick={onOverride}
            className='justify-start'
            variant={selectedAction === "override" ? "default" : "outline"}
            disabled={isImporting}>
            <Save className='h-4 w-4 mr-2' />
            {t("profiles.overrideExisting")}
          </Button>
        )}
      </div>
    </div>
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
  onOverride,
  onCancel,
  isImporting,
  importProgress,
  selectedAction,
}: ProfilePreviewProps) => {
  const { t } = useTranslation();

  return (
    <>
      <ImportOptions
        onCreateNew={onCreateNew}
        onOverride={onOverride}
        isImporting={isImporting}
        importProgress={importProgress}
        selectedAction={selectedAction}
      />
      <div className='space-y-4 max-h-64 overflow-y-auto'>
        <ModsList
          importedProfile={importedProfile}
          modsLoading={modsLoading}
          modsData={modsData}
        />
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel} disabled={isImporting}>
          {t("common.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
};
