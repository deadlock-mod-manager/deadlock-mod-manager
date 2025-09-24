import { profileSchema, type SharedProfile } from "@deadlock-mods/shared";
import { CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import useAbout from "@/hooks/use-about";
import { useHardwareId } from "@/hooks/use-hardware-id";
import { shareProfile } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ModFileTree } from "@/types/mods";

export const ProfileShareDialog = () => {
  const { hardwareId } = useHardwareId();
  const { version } = useAbout();
  const { t } = useTranslation();
  const { getActiveProfile, localMods } = usePersistedStore();
  const [profileId, setProfileId] = useState<string | null>(null);

  const activeProfile = getActiveProfile();
  const enabledMods = Object.values(activeProfile?.enabledMods ?? {})
    .filter((mod) => mod.enabled)
    .map((mod) => {
      // Find the local mod to get installation details
      const localMod = localMods.find((m) => m.remoteId === mod.remoteId);

      const baseModData: {
        remoteId: string;
        fileTree?: ModFileTree;
        selectedDownload?: {
          remoteId: string;
          file: string;
          url: string;
          size: number;
        };
      } = {
        remoteId: mod.remoteId,
      };

      // Add file tree information if available (for any mod that has file tree data)
      if (localMod?.installedFileTree) {
        baseModData.fileTree = localMod.installedFileTree;
      }

      // Add selected download information if available
      if (localMod?.downloads && localMod.downloads.length > 0) {
        // Use the tracked selected download if available, otherwise fall back to first download
        const selectedDownload =
          localMod.selectedDownload || localMod.downloads[0];
        if (selectedDownload) {
          baseModData.selectedDownload = {
            remoteId: mod.remoteId, // Using mod remoteId as download identifier
            file: selectedDownload.name,
            url: selectedDownload.url,
            size: selectedDownload.size,
          };
        }
      }

      return baseModData;
    });

  const mutationKey = [
    "shareProfile",
    hardwareId,
    version,
    JSON.stringify(enabledMods),
  ];

  const { mutate, isLoading } = useMutation(
    async (params: {
      hardwareId: string;
      name: string;
      version: string;
      profile: SharedProfile;
    }) => {
      if (!params.hardwareId || !params.version) {
        throw new Error("Hardware ID or version is missing");
      }
      return shareProfile(
        params.hardwareId,
        params.name,
        params.version,
        params.profile,
      );
    },
    {
      mutationKey,
      onMutate() {
        setProfileId(null);
      },
      onError(error) {
        setProfileId(null);
        logger.error(error);
        toast.error(t("profiles.shareError"));
      },
      onSuccess(data) {
        setProfileId(data?.id ?? null);
      },
    },
  );

  const onSubmit = () => {
    logger.info("Creating profile with enhanced mod data", {
      enabledModsCount: enabledMods.length,
      enabledMods: enabledMods.map((mod) => ({
        remoteId: mod.remoteId,
        hasFileTree: !!mod.fileTree,
        hasSelectedDownload: !!mod.selectedDownload,
      })),
    });

    const validatedProfile = profileSchema.safeParse({
      version: "1",
      payload: {
        mods: enabledMods,
      },
    });

    if (!validatedProfile.success) {
      logger.error("Invalid profile", {
        profile: validatedProfile.error,
        enabledMods,
      });
      toast.error(t("profiles.shareError"));
      return;
    }

    logger.info("Profile validation successful", {
      validatedProfile: validatedProfile.data,
      originalEnabledMods: enabledMods,
      validatedMods: validatedProfile.data.payload.mods,
    });

    if (!validatedProfile || !hardwareId || !version) {
      logger.error("Hardware ID or version is missing");
      toast.error(t("profiles.noHardwareIdOrVersion"));
      return;
    }

    if (validatedProfile.data.payload.mods.length === 0) {
      toast.error(t("profiles.shareNoMods"));
      return;
    }

    const payload = {
      hardwareId,
      name: activeProfile?.name ?? "",
      version: version ?? "",
      profile: validatedProfile.data,
    };

    logger.info("Sharing profile", {
      payload: JSON.stringify(payload, null, 2),
      profileMods: validatedProfile.data.payload.mods,
    });

    return mutate(payload);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          isLoading={isLoading}
          icon={<ShareNetworkIcon />}
          variant='text'
          disabled={!hardwareId || !version}
          onClick={onSubmit}>
          {t("profiles.share")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("profiles.share")}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <p className='text-sm font-medium text-muted-foreground'>
              {t("profiles.shareInstructions")}
            </p>
          </div>
          <div className='space-y-2'>
            <div className='flex gap-2'>
              <Input
                id='profile-id'
                value={profileId ?? "-"}
                readOnly
                className='font-mono text-sm'
              />
              <Button
                variant='outline'
                icon={<CopyIcon />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profileId ?? "");
                    toast.success(t("profiles.profileIdCopied"));
                  } catch {
                    toast.error(t("profiles.profileIdCopyError"));
                  }
                }}>
                {t("common.copy")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
