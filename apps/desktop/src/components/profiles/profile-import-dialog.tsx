import {
  getOrderedSharedProfileMods,
  type ModDto,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ImportIcon } from "@deadlock-mods/ui/icons";
import { useMutation, useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProfileImport } from "@/hooks/use-profile-import";
import { getMod, getProfile } from "@/lib/api";
import {
  ProfileImportForm,
  type ProfileImportFormData,
} from "./profile-import-form";
import { ProfilePreview } from "./profile-preview";

export const ProfileImportDialog = () => {
  const [open, setOpen] = useState(false);
  const [importedProfile, setImportedProfile] = useState<SharedProfile | null>(
    null,
  );
  const { t } = useTranslation();
  const { createProfileFromImport, importProgress } = useProfileImport();

  const fetchProfileMutation = useMutation({
    mutationFn: (profileId: string) => getProfile(profileId.trim()),
    onSuccess: (data) => {
      setImportedProfile(data);
      toast.success(t("profiles.importSuccess"));
    },
    onError: () => {
      toast.error(t("profiles.importError"));
      setImportedProfile(null);
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: ({
      profile,
      availableMods,
    }: {
      profile: SharedProfile;
      availableMods: ModDto[];
    }) => createProfileFromImport(profile, availableMods),
    onSuccess: () => {
      handleCancel();
    },
  });

  const orderedImportedMods = importedProfile
    ? getOrderedSharedProfileMods(importedProfile)
    : [];

  // Fetch mod details for each mod in the imported profile
  const modQueries = useQueries({
    queries: orderedImportedMods.map((mod) => ({
      queryKey: ["mod", mod.remoteId],
      queryFn: () => getMod(mod.remoteId),
    })),
  });

  const modsLoading = modQueries.some((query) => query.isPending);
  const modsData = modQueries
    .map((query) => query.data)
    .filter(Boolean) as ModDto[];

  const onSubmit = async (values: ProfileImportFormData) => {
    if (!values.profileId?.trim()) {
      toast.error(t("profiles.profileIdRequired"));
      return;
    }
    await fetchProfileMutation.mutateAsync(values.profileId);
  };

  const handleCancel = () => {
    setImportedProfile(null);
    setOpen(false);
  };

  const handleCreateNewProfile = () => {
    if (!importedProfile) return;

    createProfileMutation.mutate({
      profile: importedProfile,
      availableMods: modsData,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant='outline' icon={<ImportIcon />}>
          {t("profiles.import")}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[600px]'>
        <DialogHeader>
          <DialogTitle>
            {importedProfile
              ? t("profiles.importPreview")
              : t("profiles.import")}
          </DialogTitle>
          <DialogDescription>
            {importedProfile
              ? t("profiles.importPreviewDescription")
              : t("profiles.importDescription")}
          </DialogDescription>
        </DialogHeader>

        {importedProfile ? (
          <ProfilePreview
            importedProfile={importedProfile}
            modsLoading={modsLoading}
            modsData={modsData}
            onCreateNew={handleCreateNewProfile}
            onCancel={handleCancel}
            isImporting={createProfileMutation.isPending}
            importProgress={importProgress}
          />
        ) : (
          <ProfileImportForm
            onSubmit={onSubmit}
            onCancel={handleCancel}
            isLoading={fetchProfileMutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
