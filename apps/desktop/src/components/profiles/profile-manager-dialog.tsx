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
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { useProfileImport } from "@/hooks/use-profile-import";
import { useSyncProfiles } from "@/hooks/use-sync-profiles";
import logger from "@/lib/logger";
import { getImportedProfileMissingRemoteIds } from "@/lib/profiles/import-recovery";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";
import type { ModProfile, ModProfileEntry, ProfileId } from "@/types/profiles";
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

export const ProfileManagerDialog = ({
  open,
  onOpenChange,
}: ProfileManagerDialogProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const { localMods } = usePersistedStore();
  const confirm = useConfirm();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileId | null>(null);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<ProfileId>>(
    new Set(),
  );
  const { retryImportedProfile } = useProfileImport({
    listenToProgress: false,
  });

  useSyncProfiles(open);

  const {
    getAllProfiles,
    getActiveProfile,
    deleteProfile,
    switchToProfile,
    syncProfilesWithFilesystem,
  } = usePersistedStore();

  const profiles = getAllProfiles();
  const activeProfile = getActiveProfile();

  const localModsByRemoteId = useMemo(
    () => new Map(localMods.map((mod) => [mod.remoteId, mod] as const)),
    [localMods],
  );

  const syncProfilesMutation = useMutation({
    mutationFn: () => syncProfilesWithFilesystem(),
    onSuccess: () => {
      toast.success(t("profiles.syncSuccess"));
    },
    onError: (error) => {
      logger.withError(error).error("Failed to sync profiles");
      toast.error(t("profiles.syncError"));
    },
  });

  const retryImportedProfileMutation = useMutation({
    mutationFn: (profile: ModProfile) => retryImportedProfile(profile.id),
    onSuccess: (result, profile) => {
      if (result.attemptedCount === 0) {
        toast.success(t("profiles.retryImportNoMissing"));
        return;
      }

      if (result.remainingCount === 0) {
        toast.success(
          t("profiles.retryImportSuccess", {
            profileName: profile.name,
          }),
        );
        return;
      }

      toast.warning(
        t("profiles.retryImportPartial", {
          profileName: profile.name,
          recovered: result.recoveredCount,
          remaining: result.remainingCount,
        }),
      );
    },
    onError: (error) => {
      logger.withError(error).error("Failed to retry imported profile");
      toast.error(t("profiles.retryImportError"));
    },
  });

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

  const getEnabledModsInfo = (
    profile: ModProfile,
    modsByRemoteId: Map<string, LocalMod>,
  ): EnabledModsInfo => {
    const enabledEntries = Object.values(profile.enabledMods || {}).filter(
      (entry: ModProfileEntry) => entry.enabled,
    );

    const enabledMods: ModInfo[] = enabledEntries
      .map((entry) => {
        const localMod = modsByRemoteId.get(entry.remoteId);
        return localMod
          ? { name: localMod.name, remoteId: entry.remoteId }
          : null;
      })
      .filter((mod): mod is ModInfo => mod !== null);

    return {
      count: enabledEntries.length,
      mods: enabledMods,
    };
  };

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
          <div className='flex-1 overflow-auto'>
            <div className='grid gap-4 pb-4'>
              {profiles.map((profile) => {
                const enabledModsInfo = getEnabledModsInfo(
                  profile,
                  localModsByRemoteId,
                );
                const missingImportedModCount =
                  getImportedProfileMissingRemoteIds(profile).length;
                const isRetryingImport =
                  retryImportedProfileMutation.isPending &&
                  retryImportedProfileMutation.variables?.id === profile.id;

                return (
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
                            {missingImportedModCount > 0 && (
                              <Badge variant='destructive' className='shrink-0'>
                                {t("profiles.importRecoveryNeeded", {
                                  count: missingImportedModCount,
                                })}
                              </Badge>
                            )}
                            <Button
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
                              checked={profile.id === activeProfile?.id}
                              onCheckedChange={(checked) => {
                                if (
                                  checked &&
                                  profile.id !== activeProfile?.id
                                ) {
                                  handleSetActive(profile.id);
                                }
                              }}
                              aria-label={t("profiles.activateProfileLabel", {
                                profileName: profile.name,
                              })}
                            />
                            <span className='text-sm font-medium'>
                              {profile.id === activeProfile?.id
                                ? t("profiles.statusActive")
                                : t("profiles.statusInactive")}
                            </span>
                          </div>
                          {!profile.isDefault && (
                            <Button
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
                      {missingImportedModCount > 0 && (
                        <div className='flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2'>
                          <p className='text-sm text-muted-foreground'>
                            {t("profiles.importRecoveryDescription", {
                              count: missingImportedModCount,
                            })}
                          </p>
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={retryImportedProfileMutation.isPending}
                            onClick={() =>
                              retryImportedProfileMutation.mutate(profile)
                            }
                            icon={
                              <RefreshCw
                                className={`w-4 h-4 ${isRetryingImport ? "animate-spin" : ""}`}
                              />
                            }>
                            {t("profiles.retryMissingMods")}
                          </Button>
                        </div>
                      )}
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                          {t("profiles.enabledMods")}:{" "}
                          <Badge variant='secondary'>
                            {enabledModsInfo.count}
                          </Badge>
                        </div>
                        {enabledModsInfo.count > 0 && (
                          <button
                            onClick={() => toggleProfileExpanded(profile.id)}
                            className='flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors cursor-pointer'>
                            <span>
                              {expandedProfiles.has(profile.id)
                                ? t("profiles.hideModList")
                                : t("profiles.showModList")}
                            </span>
                            {expandedProfiles.has(profile.id) ? (
                              <ChevronUp className='w-3 h-3' />
                            ) : (
                              <ChevronDown className='w-3 h-3' />
                            )}
                          </button>
                        )}
                      </div>
                    </CardContent>
                    {expandedProfiles.has(profile.id) && (
                      <div className='px-6 pb-6'>
                        {enabledModsInfo.mods.length > 0 && (
                          <div className='grid gap-2'>
                            {enabledModsInfo.mods.map((mod, index) => (
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
                                    {t("profiles.modId", { id: mod.remoteId })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => syncProfilesMutation.mutate()}
              disabled={syncProfilesMutation.isPending}
              variant='outline'
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${syncProfilesMutation.isPending ? "animate-spin" : ""}`}
                />
              }>
              {t("profiles.sync")}
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              icon={<Plus className='w-4 h-4' />}>
              {t("profiles.createNew")}
            </Button>
            <ProfileImportDialog />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProfileCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
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
