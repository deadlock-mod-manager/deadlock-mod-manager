import {
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { usePersistedStore } from "@/lib/store";
import type { ModProfile, ModProfileEntry, ProfileId } from "@/types/profiles";
import { ProfileCreateDialog } from "./profile-create-dialog";
import { ProfileEditDialog } from "./profile-edit-dialog";

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
  const { localMods } = usePersistedStore();
  const confirm = useConfirm();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileId | null>(null);
  const [expandedProfiles, setExpandedProfiles] = useState<Set<ProfileId>>(
    new Set(),
  );

  const { getAllProfiles, getActiveProfile, deleteProfile, switchToProfile } =
    usePersistedStore();

  const profiles = getAllProfiles();
  const activeProfile = getActiveProfile();

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
      const success = deleteProfile(profileId);
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

      if (result.errors.length > 0) {
        toast.error(
          t("profiles.switchError", {
            errors: result.errors.join(", "),
          }),
        );
        return;
      }

      toast.success(
        t("profiles.switchSuccess", {
          profileName: profiles.find((p) => p.id === profileId)?.name,
        }),
      );
    } catch (error) {
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
        const localMod = localMods.find(
          (mod) => mod.remoteId === entry.remoteId,
        );
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
          <div className='flex justify-between items-center py-4 gap-4'>
            <DialogHeader>
              <DialogTitle className='flex items-center space-x-2'>
                <Users className='w-5 h-5' />
                <span>{t("profiles.manage")}</span>
              </DialogTitle>
              <DialogDescription>
                {t("profiles.manageDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className='flex items-center gap-2'>
              <Button
                onClick={() => setShowCreateDialog(true)}
                icon={<Plus className='w-4 h-4' />}>
                {t("profiles.createNew")}
              </Button>
            </div>
          </div>

          <div className='flex-1 overflow-auto'>
            <div className='grid gap-4 pb-4'>
              {profiles.map((profile) => (
                <Card
                  key={profile.id}
                  className={`transition-all duration-200 hover:shadow-md ${
                    profile.id === activeProfile?.id
                      ? "ring-2 ring-primary/50 shadow-sm"
                      : ""
                  }`}>
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
                              if (checked && profile.id !== activeProfile?.id) {
                                handleSetActive(profile.id);
                              }
                            }}
                            aria-label={`Activate ${profile.name} profile`}
                          />
                          <span className='text-sm font-medium'>
                            {profile.id === activeProfile?.id
                              ? "Active"
                              : "Inactive"}
                          </span>
                        </div>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setEditingProfile(profile.id)}>
                          <Edit className='w-4 h-4' />
                        </Button>
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
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        {t("profiles.enabledMods")}:{" "}
                        <Badge variant='secondary'>
                          {getEnabledModsInfo(profile).count}
                        </Badge>
                      </div>
                      {getEnabledModsInfo(profile).count > 0 && (
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
                  </CardContent>
                  {expandedProfiles.has(profile.id) && (
                    <div className='px-6 pb-6'>
                      {getEnabledModsInfo(profile).mods.length > 0 && (
                        <div className='grid gap-2'>
                          {getEnabledModsInfo(profile).mods.map(
                            (mod, index) => (
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
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
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
