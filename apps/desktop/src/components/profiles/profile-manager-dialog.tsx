import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@deadlock-mods/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "@deadlock-mods/ui/icons";
import type { ProfileBackupSummary } from "@deadlock-mods/shared";
import {
  CheckIcon,
  CloudArrowUpIcon,
  CloudIcon,
  DesktopTowerIcon,
} from "@phosphor-icons/react";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { useAuth } from "@/hooks/use-auth";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import {
  useBackupProfile,
  useProfileBackupStatuses,
  useProfileBackups,
} from "@/hooks/use-profile-backups";
import type { RestoreDestination } from "@/hooks/use-restore-profile-backup";
import { useSyncProfiles } from "@/hooks/use-sync-profiles";
import logger from "@/lib/logger";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import type { ProfileBackupStatus } from "@/lib/profiles/profile-backup";
import { usePersistedStore } from "@/lib/store";
import type { ModProfile, ModProfileEntry, ProfileId } from "@/types/profiles";
import { CloudBackupsPanel } from "./cloud-backup/cloud-backups-panel";
import { ProfileBackupStatusRow } from "./cloud-backup/profile-backup-status";
import { RestoreBackupDialog } from "./cloud-backup/restore-backup-dialog";
import { WelcomeBackBanner } from "./cloud-backup/welcome-back-banner";
import { ProfileCreateDialog } from "./profile-create-dialog";
import { ProfileEditDialog } from "./profile-edit-dialog";
import { ProfileImportDialog } from "./profile-import-dialog";

interface ProfileManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ModInfo {
  name: string;
  remoteId: string;
}

interface EnabledModsInfo {
  count: number;
  mods: ModInfo[];
}

const localModCount = (profile: ModProfile) =>
  Object.values(profile.enabledMods).filter(isLocalMod).length;

export const ProfileManagerDialog = ({
  open,
  onOpenChange,
}: ProfileManagerDialogProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const localMods = usePersistedStore((state) => state.localMods);
  const confirm = useConfirm();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileId | null>(null);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<ProfileId>>(
    new Set(),
  );
  const [isSyncing, setIsSyncing] = useState(false);

  useSyncProfiles(open);

  const profileSwitchPending = usePersistedStore((state) => state.isSwitching);
  const deleteProfile = usePersistedStore((state) => state.deleteProfile);
  const switchToProfile = usePersistedStore((state) => state.switchToProfile);
  const syncProfilesWithFilesystem = usePersistedStore(
    (state) => state.syncProfilesWithFilesystem,
  );

  const bulkPending = useIsMutating({ mutationKey: ["library-bulk"] }) > 0;
  const isSwitching = profileSwitchPending || bulkPending;
  const profiles = usePersistedStore(
    useShallow((state) => state.getAllProfiles()),
  );
  const activeProfile = usePersistedStore(
    (state) => state.profiles[state.activeProfileId],
  );

  const [tab, setTab] = useState<"local" | "cloud">("local");
  const [restoreTarget, setRestoreTarget] = useState<{
    backup: ProfileBackupSummary;
    destination: RestoreDestination;
  } | null>(null);
  const isCloudBackupEnabled = useExperimentalFeature("cloud-backup");
  const { isAuthenticated } = useAuth();
  const showBackups = isCloudBackupEnabled && isAuthenticated;
  const welcomeBackDismissed = usePersistedStore((s) => s.welcomeBackDismissed);
  const dismissWelcomeBack = usePersistedStore((s) => s.dismissWelcomeBack);
  const {
    backups,
    backupsById,
    isLoading: backupsLoading,
  } = useProfileBackups();
  const backupStatuses = useProfileBackupStatuses(backupsById, showBackups);
  const { backupProfile, backupAll } = useBackupProfile();

  const localByBackupId = new Map<
    string,
    { profileId: ProfileId; status: ProfileBackupStatus }
  >();
  for (const profile of profiles) {
    const status = backupStatuses[profile.id];
    if (status && status.kind !== "none") {
      localByBackupId.set(status.backup.id, { profileId: profile.id, status });
    }
  }
  const profilesToBackUp = profiles
    .filter(
      (profile) =>
        Object.keys(profile.enabledMods).length > 0 &&
        backupStatuses[profile.id]?.kind !== "upToDate",
    )
    .map((profile) => profile.id);
  const isFreshInstall = profiles.every(
    (profile) => Object.keys(profile.enabledMods).length === 0,
  );
  const latestRemoteBackup =
    showBackups && !welcomeBackDismissed && isFreshInstall
      ? backups.find((backup) => !localByBackupId.has(backup.id))
      : undefined;

  const handleDeleteProfile = async (
    profileId: ProfileId,
    profileName: string,
  ) => {
    const shouldDelete = await confirm({
      title: t("profiles.deleteConfirmTitle"),
      body: t("profiles.deleteConfirmBody", { profileName }),
      actionButton: t("profiles.deleteConfirmAction"),
      cancelButton: t("common.cancel"),
    });

    if (shouldDelete) {
      const success = await deleteProfile(profileId);
      if (success) {
        toast.success(t("profiles.deleteSuccess", { profileName }));
      } else {
        toast.error(t("profiles.deleteError"));
      }
    }
  };

  const handleSetActive = async (profileId: ProfileId) => {
    if (profileId === activeProfile?.id) {
      return;
    }
    // The session restores mods into the profile it started in.
    if (usePersistedStore.getState().bisectSession) {
      toast.error(t("bisect.toasts.switchBlocked"));
      return;
    }

    try {
      const result = await switchToProfile(profileId);
      const targetProfile = profiles.find((p) => p.id === profileId);

      if (result.errors.length > 0) {
        toast.error(
          t("profiles.switchError", {
            errors: result.errors.join(", "),
          }),
        );
        return;
      }

      analytics.trackProfileSwitched(
        activeProfile?.name || "Unknown",
        targetProfile?.name || "Unknown",
        {
          enabled_mods: result.enabledMods.length,
          disabled_mods: result.disabledMods.length,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
      );

      toast.success(
        t("profiles.switchSuccess", {
          profileName: targetProfile?.name,
        }),
      );
    } catch (error) {
      logger.withError(error).error("Failed to switch profile");
      toast.error(t("profiles.switchUnexpectedError"));
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return t("common.never");
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));
  };

  const toggleProfileExpanded = (profileId: ProfileId) => {
    setExpandedProfiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(profileId)) {
        newSet.delete(profileId);
      } else {
        newSet.add(profileId);
      }
      return newSet;
    });
  };

  const getEnabledModsInfo = (profile: ModProfile): EnabledModsInfo => {
    const enabledEntries = Object.values(profile.enabledMods || {}).filter(
      (entry: ModProfileEntry) => entry.enabled,
    );

    const enabledMods: ModInfo[] = enabledEntries
      .map((entry) => {
        const mod =
          (profile.mods ?? []).find((m) => m.remoteId === entry.remoteId) ??
          localMods.find((m) => m.remoteId === entry.remoteId);
        return mod ? { name: mod.name, remoteId: entry.remoteId } : null;
      })
      .filter((mod): mod is ModInfo => mod !== null);

    return {
      count: enabledEntries.length,
      mods: enabledMods,
    };
  };

  const handleSyncProfiles = async () => {
    setIsSyncing(true);
    try {
      await syncProfilesWithFilesystem();
      toast.success(t("profiles.syncSuccess"));
    } catch (error) {
      logger.withError(error).error("Failed to sync profiles");
      toast.error(t("profiles.syncError"));
    } finally {
      setIsSyncing(false);
    }
  };

  const localList = (
    <div className='grid gap-4 pb-4'>
      {latestRemoteBackup && (
        <WelcomeBackBanner
          latest={latestRemoteBackup}
          backupCount={backups.length}
          onRestore={(backup) =>
            setRestoreTarget({
              backup,
              // Nothing is installed yet, so replacing loses nothing.
              destination: "replace",
            })
          }
          onSeeAll={() => setTab("cloud")}
          onDismiss={dismissWelcomeBack}
        />
      )}
      {profiles.map((profile) => (
        <Card key={profile.id}>
          <CardHeader className='pb-3'>
            <div className='flex items-start justify-between'>
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 mb-1'>
                  <h3 className='font-semibold text-lg truncate'>
                    {profile.name}
                  </h3>
                  {profile.id === activeProfile?.id && (
                    <Badge variant='default' className='shrink-0'>
                      {t("profiles.active")}
                    </Badge>
                  )}
                  {profile.isDefault && (
                    <Badge variant='secondary' className='shrink-0'>
                      {t("profiles.default")}
                    </Badge>
                  )}
                  <Button
                    aria-label={t("profiles.editNamed", {
                      profileName: profile.name,
                    })}
                    title={t("profiles.editNamed", {
                      profileName: profile.name,
                    })}
                    disabled={isSwitching}
                    variant='transparent'
                    size='sm'
                    onClick={() => setEditingProfile(profile.id)}>
                    <Edit className='w-4 h-4' />
                  </Button>
                </div>
                {profile.description && (
                  <p className='text-sm text-muted-foreground line-clamp-2'>
                    {profile.description}
                  </p>
                )}
              </div>
              <div className='flex items-center gap-2 ml-4'>
                <div className='flex items-center gap-2'>
                  <Switch
                    disabled={isSwitching}
                    checked={profile.id === activeProfile?.id}
                    onCheckedChange={(checked) => {
                      if (checked && profile.id !== activeProfile?.id) {
                        handleSetActive(profile.id);
                      }
                    }}
                    aria-label={t("profiles.activateNamed", {
                      profileName: profile.name,
                    })}
                  />
                  <span className='text-sm font-medium'>
                    {profile.id === activeProfile?.id
                      ? t("profiles.active")
                      : t("profiles.inactive")}
                  </span>
                </div>
                {!profile.isDefault && (
                  <Button
                    aria-label={t("profiles.deleteNamed", {
                      profileName: profile.name,
                    })}
                    title={t("profiles.deleteNamed", {
                      profileName: profile.name,
                    })}
                    disabled={isSwitching}
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      handleDeleteProfile(profile.id, profile.name)
                    }>
                    <Trash2 className='w-4 h-4' />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-3 gap-4 text-sm'>
              <div>
                <div className='font-medium text-muted-foreground mb-1'>
                  {t("profiles.lastUsed")}
                </div>
                <div className='text-foreground'>
                  {formatDate(profile.lastUsed)}
                </div>
              </div>
              <div>
                <div className='font-medium text-muted-foreground mb-1'>
                  {t("profiles.created")}
                </div>
                <div className='text-foreground'>
                  {formatDate(profile.createdAt)}
                </div>
              </div>
            </div>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                {t("profiles.enabledMods")}:{" "}
                <Badge variant='secondary'>
                  {getEnabledModsInfo(profile).count}
                </Badge>
              </div>
              {getEnabledModsInfo(profile).mods.length > 0 && (
                <button
                  onClick={() => toggleProfileExpanded(profile.id)}
                  className='flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer'>
                  <span>
                    {expandedProfiles.has(profile.id) ? "Hide" : "Show"}
                  </span>
                  {expandedProfiles.has(profile.id) ? (
                    <ChevronUp className='w-3 h-3' />
                  ) : (
                    <ChevronDown className='w-3 h-3' />
                  )}
                </button>
              )}
            </div>
            {showBackups && (
              <ProfileBackupStatusRow
                profileName={profile.name}
                status={backupStatuses[profile.id] ?? { kind: "none" }}
                localModCount={localModCount(profile)}
                isBackingUp={
                  (backupProfile.isPending &&
                    backupProfile.variables?.profileId === profile.id) ||
                  (backupAll.isPending &&
                    !!backupAll.variables?.includes(profile.id))
                }
                disabled={
                  isSwitching || Object.keys(profile.enabledMods).length === 0
                }
                onBackUp={() => backupProfile.mutate({ profileId: profile.id })}
              />
            )}
          </CardContent>
          {expandedProfiles.has(profile.id) && (
            <div className='px-6 pb-6'>
              {getEnabledModsInfo(profile).mods.length > 0 && (
                <div className='grid gap-2'>
                  {getEnabledModsInfo(profile).mods.map((mod, index) => (
                    <div
                      key={mod.remoteId}
                      className='flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors'>
                      <div className='flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center'>
                        <span className='text-xs font-medium text-primary'>
                          {index + 1}
                        </span>
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium text-foreground truncate'>
                          {mod.name}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          ID: {mod.remoteId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-w-4xl max-h-[80vh] overflow-hidden flex flex-col'>
          <div className='flex items-center  gap-4'>
            <DialogHeader className='flex-1'>
              <DialogTitle className='flex items-center space-x-2'>
                <Users className='w-5 h-5' />
                <span>{t("profiles.manage")}</span>
              </DialogTitle>
              <DialogDescription>
                {t("profiles.manageDescription")}
              </DialogDescription>
            </DialogHeader>
          </div>
          {profileSwitchPending && (
            <p
              role='status'
              className='flex items-center gap-2 text-sm text-muted-foreground'>
              <RefreshCw aria-hidden className='size-4 animate-spin' />
              {t("profiles.switching")}
            </p>
          )}
          {isCloudBackupEnabled ? (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as "local" | "cloud")}
              className='flex min-h-0 flex-1 flex-col gap-3'>
              <TabsList className='self-start'>
                <TabsTrigger value='local' className='gap-2'>
                  <DesktopTowerIcon aria-hidden className='size-4' />
                  {t("cloudBackup.tabLocal")}
                  <span className='rounded-full bg-muted px-1.5 font-mono text-[11px] text-muted-foreground'>
                    {profiles.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value='cloud' className='gap-2'>
                  <CloudIcon aria-hidden className='size-4' />
                  {t("cloudBackup.tabCloud")}
                  {showBackups && (
                    <span className='rounded-full bg-muted px-1.5 font-mono text-[11px] text-muted-foreground'>
                      {backups.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value='local' className='mt-0 flex-1 overflow-auto'>
                {localList}
              </TabsContent>
              <TabsContent
                value='cloud'
                className='mt-0 flex-1 overflow-auto pb-4'>
                <CloudBackupsPanel
                  isAuthenticated={isAuthenticated}
                  backups={backups}
                  isLoading={backupsLoading}
                  localByBackupId={localByBackupId}
                  disabled={isSwitching}
                  onRestore={(backup) =>
                    setRestoreTarget({ backup, destination: "new" })
                  }
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className='flex-1 overflow-auto'>{localList}</div>
          )}
          <DialogFooter>
            <Button
              onClick={handleSyncProfiles}
              disabled={isSyncing || isSwitching}
              variant='outline'
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                />
              }>
              {t("profiles.sync")}
            </Button>
            {showBackups && tab === "local" && (
              <Button
                variant='outline'
                disabled={isSwitching || profilesToBackUp.length === 0}
                isLoading={backupAll.isPending}
                icon={
                  profilesToBackUp.length === 0 ? (
                    <CheckIcon className='size-4' />
                  ) : (
                    <CloudArrowUpIcon className='size-4' />
                  )
                }
                onClick={() => backupAll.mutate(profilesToBackUp)}>
                {profilesToBackUp.length === 0
                  ? t("cloudBackup.allBackedUp")
                  : t("cloudBackup.backUpAll")}
              </Button>
            )}
            <Button
              disabled={isSwitching}
              onClick={() => setShowCreateDialog(true)}
              icon={<Plus className='w-4 h-4' />}>
              {t("profiles.createNew")}
            </Button>
            <ProfileImportDialog disabled={isSwitching} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      <RestoreBackupDialog
        key={restoreTarget?.backup.id}
        backup={restoreTarget?.backup ?? null}
        defaultDestination={restoreTarget?.destination}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      />

      {editingProfile && (
        <ProfileEditDialog
          profileId={editingProfile}
          open={!!editingProfile}
          onOpenChange={(open) => {
            if (!open) setEditingProfile(null);
          }}
        />
      )}
    </>
  );
};
