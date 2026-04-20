import {
  profileSchema,
  type ProfileModDownload,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import useAbout from "@/hooks/use-about";
import { useHardwareId } from "@/hooks/use-hardware-id";
import { shareProfile } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ModFileTree } from "@/types/mods";

export const ProfileShareDialog = () => {
  const { hardwareId } = useHardwareId();
  const { version } = useAbout();
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const { getActiveProfile, getOrderedMods, localMods } = usePersistedStore();
  const [profileId, setProfileId] = useState<string | null>(null);

  const activeProfile = getActiveProfile();
  const enabledModIds = new Set(
    Object.values(activeProfile?.enabledMods ?? {})
      .filter((mod) => mod.enabled)
      .map((mod) => mod.remoteId),
  );
  const localModsByRemoteId = new Map(
    localMods.map((mod) => [mod.remoteId, mod]),
  );

  const toSharedProfileMod = (remoteId: string) => {
    const localMod = localModsByRemoteId.get(remoteId);
    const baseModData: {
      remoteId: string;
      fileTree?: ModFileTree;
      selectedDownloads?: ProfileModDownload[];
    } = {
      remoteId,
    };

    if (localMod?.installedFileTree) {
      const hasAnySelected = localMod.installedFileTree.files.some(
        (file) => file.is_selected,
      );

      baseModData.fileTree = hasAnySelected
        ? localMod.installedFileTree
        : {
            ...localMod.installedFileTree,
            files: localMod.installedFileTree.files.map((file) => ({
              ...file,
              is_selected: true,
            })),
          };
    }

    if (localMod?.downloads && localMod.downloads.length > 0) {
      const selectedDownloads = localMod.selectedDownloads?.length
        ? localMod.selectedDownloads
        : [localMod.downloads[0]];
      baseModData.selectedDownloads = selectedDownloads.map((download) => ({
        remoteId,
        file: download.name,
        url: download.url,
        size: download.size,
      }));
    }

    return baseModData;
  };

  const orderedEnabledMods = getOrderedMods()
    .filter((mod) => enabledModIds.has(mod.remoteId))
    .map((mod) => toSharedProfileMod(mod.remoteId));
  const orderedEnabledModIds = new Set(
    orderedEnabledMods.map((mod) => mod.remoteId),
  );
  const missingEnabledMods = [...enabledModIds]
    .filter((remoteId) => !orderedEnabledModIds.has(remoteId))
    .map((remoteId) => toSharedProfileMod(remoteId));
  const sharedMods = [...orderedEnabledMods, ...missingEnabledMods];
  const sharedLoadOrder = sharedMods.map((mod) => mod.remoteId);

  const { mutate, isPending } = useMutation({
    mutationFn: async (params: {
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
    onMutate() {
      setProfileId(null);
    },
    onError(error) {
      setProfileId(null);
      logger.errorOnly(error);
      toast.error(t("profiles.shareError"));
    },
    onSuccess(data) {
      setProfileId(data?.id ?? null);

      if (data?.id) {
        analytics.trackProfileShared(data.id, sharedMods.length, "link");
      }
    },
  });

  const onSubmit = () => {
    const validatedProfile = profileSchema.safeParse({
      version: "2",
      payload: {
        mods: sharedMods,
        loadOrder: sharedLoadOrder,
      },
    });

    if (!validatedProfile.success) {
      logger
        .withMetadata({
          profile: validatedProfile.error,
          enabledMods: sharedMods,
        })
        .error("Invalid profile");
      toast.error(t("profiles.shareError"));
      return;
    }

    if (!hardwareId || !version) {
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

    logger
      .withMetadata({
        profileName: payload.name,
        profileVersion: validatedProfile.data.version,
        modsCount: validatedProfile.data.payload.mods.length,
      })
      .info("Sharing profile");

    return mutate(payload);
  };

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              aria-label={t("profiles.share")}
              className='group/share relative flex h-full shrink-0 items-center justify-center rounded-r-md px-2 text-muted-foreground transition-colors duration-150 hover:bg-primary/[0.06] hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
              disabled={!hardwareId || !version || isPending}
              onClick={onSubmit}
              type='button'>
              <ShareNetworkIcon
                className={cn(
                  "size-3.5 transition-transform duration-200 group-hover/share:-translate-y-px",
                  isPending && "animate-pulse",
                )}
              />
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side='bottom' sideOffset={8}>
          <p>{t("profiles.share")}</p>
        </TooltipContent>
      </Tooltip>
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
