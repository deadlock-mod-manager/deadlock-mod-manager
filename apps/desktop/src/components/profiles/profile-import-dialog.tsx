import type { ModDto, SharedProfile } from "@deadlock-mods/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ImportIcon } from "@deadlock-mods/ui/icons";
import { useMutation, useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProfileImport } from "@/hooks/use-profile-import";
import { getMod, getProfile } from "@/lib/api-client";
import {
  getProfileModCandidateIds,
  rewriteProfileIdentities,
} from "@/lib/profiles/import-profile-shared";
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
  const [legacySelections, setLegacySelections] = useState<
    Record<number, string>
  >({});
  const { t } = useTranslation();
  const { createProfileFromImport, importProgress } = useProfileImport();

  const fetchProfileMutation = useMutation({
    mutationFn: (profileId: string) => getProfile(profileId.trim()),
    onSuccess: (data) => {
      setImportedProfile(data);
      setLegacySelections({});
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
      sourceProfileId,
    }: {
      profile: SharedProfile;
      availableMods: ModDto[];
      sourceProfileId?: string;
    }) =>
      createProfileFromImport(profile, availableMods, {
        sourceProfileId,
      }),
    onSuccess: () => {
      handleCancel();
    },
  });

  const orderedImportedMods = importedProfile
    ? importedProfile.payload.mods
    : [];

  const candidateEntries = importedProfile
    ? orderedImportedMods.flatMap((_, modIndex) =>
        getProfileModCandidateIds(importedProfile, modIndex).map(
          (remoteId) => ({ modIndex, remoteId }),
        ),
      )
    : [];

  const modQueries = useQueries({
    queries: candidateEntries.map(({ remoteId }) => ({
      queryKey: ["mod", remoteId],
      queryFn: () => getMod(remoteId),
    })),
  });

  const modsLoading = modQueries.some((query) => query.isPending);
  const availableCandidates = orderedImportedMods.map((_, modIndex) =>
    candidateEntries.flatMap((entry, queryIndex) => {
      const mod = modQueries[queryIndex]?.data;
      return entry.modIndex === modIndex && mod
        ? [{ remoteId: entry.remoteId, mod }]
        : [];
    }),
  );
  const ambiguousMods = availableCandidates
    .map((candidates, modIndex) => ({ candidates, modIndex }))
    .filter(({ candidates }) => candidates.length > 1);
  const resolvedIds = importedProfile
    ? orderedImportedMods.map((mod, modIndex) => {
        const candidates = availableCandidates[modIndex] ?? [];
        if (candidates.length > 1) {
          return legacySelections[modIndex] ?? mod.remoteId;
        }
        return (
          candidates[0]?.remoteId ??
          getProfileModCandidateIds(importedProfile, modIndex)[0] ??
          mod.remoteId
        );
      })
    : [];
  const resolvedProfile = importedProfile
    ? rewriteProfileIdentities(importedProfile, resolvedIds)
    : null;
  const modsData = availableCandidates.flatMap((candidates, modIndex) => {
    const selectedId = resolvedIds[modIndex];
    const selected = candidates.find(
      (candidate) => candidate.remoteId === selectedId,
    );
    return selected ? [selected.mod] : [];
  }) satisfies ModDto[];

  const onSubmit = async (values: ProfileImportFormData) => {
    const profileId = values.profileId?.trim();

    if (!profileId) {
      toast.error(t("profiles.profileIdRequired"));
      return;
    }

    await fetchProfileMutation.mutateAsync(profileId);
  };

  const handleCancel = () => {
    setImportedProfile(null);
    setLegacySelections({});
    setOpen(false);
  };

  const handleCreateNewProfile = () => {
    if (!resolvedProfile) return;
    if (
      ambiguousMods.some(
        ({ modIndex }) => legacySelections[modIndex] === undefined,
      )
    ) {
      toast.error(
        t("profiles.legacyIdentityRequired", {
          defaultValue: "Choose whether each ambiguous item is a mod or sound.",
        }),
      );
      return;
    }

    const sourceProfileId = fetchProfileMutation.variables?.trim();

    createProfileMutation.mutate({
      profile: resolvedProfile,
      availableMods: modsData,
      sourceProfileId,
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
          <>
            {ambiguousMods.length > 0 && (
              <div className='space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3'>
                <p className='text-sm font-medium'>
                  {t("profiles.legacyIdentityTitle", {
                    defaultValue: "Choose the matching GameBanana item",
                  })}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t("profiles.legacyIdentityDescription", {
                    defaultValue:
                      "This older profile ID exists as both a mod and a sound.",
                  })}
                </p>
                {ambiguousMods.map(({ candidates, modIndex }) => (
                  <Select
                    key={candidates
                      .map((candidate) => candidate.remoteId)
                      .join("-")}
                    value={legacySelections[modIndex]}
                    onValueChange={(remoteId) =>
                      setLegacySelections((current) => ({
                        ...current,
                        [modIndex]: remoteId,
                      }))
                    }>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("profiles.legacyIdentityPlaceholder", {
                          defaultValue: "Select mod or sound",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map(({ mod, remoteId }) => (
                        <SelectItem key={remoteId} value={remoteId}>
                          {remoteId.startsWith("snd-")
                            ? t("profiles.submissionTypeSound")
                            : t("profiles.submissionTypeMod")}
                          : {mod.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            )}
            <ProfilePreview
              importedProfile={resolvedProfile ?? importedProfile}
              modsLoading={modsLoading}
              modsData={modsData}
              onCreateNew={handleCreateNewProfile}
              onCancel={handleCancel}
              isImporting={createProfileMutation.isPending}
              importProgress={importProgress}
            />
          </>
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
