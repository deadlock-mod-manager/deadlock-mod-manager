import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card, CardHeader, CardTitle } from "@deadlock-mods/ui/components/card";
import { CalendarIcon, DownloadIcon, HeartIcon } from "@deadlock-mods/ui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import {
  UpdateAvailableBadge,
  UpdatedRecentlyBadge,
} from "@/components/mod-management/mod-update-badges";
import { ObsoleteModWarning } from "@/components/mod-management/obsolete-mod-warning";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import ModCardSkeleton from "@/components/skeletons/mod-card";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { prefetchModDetail } from "@/lib/mods/mod-detail-prefetch";
import { usePersistedStore } from "@/lib/store";
import {
  cn,
  isModOutdated,
  isUpdateAvailable,
  isUpdatedRecently,
} from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import FavoriteButton from "./favorite-button";
import ModButton from "./mod-button";
import { NSFWBlur } from "./nsfw-blur";

interface ModCardProps {
  mod?: ModDto;
  readOnly?: boolean;
}

const ModCard = memo(({ mod, readOnly = false }: ModCardProps) => {
  const { t } = useTranslation();
  const localMod = usePersistedStore((state) =>
    state.localMods.find((m) => m.remoteId === mod?.remoteId),
  );
  const CardWrapper = useThemeOverride("cardWrapper");

  const status = localMod?.status;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  if (!mod) {
    return <ModCardSkeleton />;
  }

  const openModDetail = () => {
    void prefetchModDetail(queryClient, mod.remoteId);
    navigate(`/mods/${mod.remoteId}`);
  };

  const cardContent = (
    <Card
      className={cn(
        "group shadow-none border [contain:layout_style_paint] h-full",
        !readOnly && "cursor-pointer",
      )}
      onClick={
        readOnly
          ? undefined
          : (e) => {
              e.stopPropagation();
              openModDetail();
            }
      }>
      <div className='relative'>
        {mod.isAudio ? (
          <AudioPlayerPreview
            audioUrl={mod.audioUrl || ""}
            onPlayClick={(e) => e.stopPropagation()}
            variant='default'
          />
        ) : mod.images.length > 0 ? (
          <NSFWBlur
            blurStrength={nsfwSettings.blurStrength}
            className='h-48 w-full overflow-hidden rounded-t-xl'
            disableBlur={nsfwSettings.disableBlur}
            isNSFW={shouldBlur}
            onToggleVisibility={handleNSFWToggle}>
            <img
              alt={mod.name}
              className='h-48 w-full object-cover'
              decoding='async'
              height='192'
              loading='lazy'
              src={mod.images[0]}
              width='320'
            />
          </NSFWBlur>
        ) : (
          // Fallback for mods without images or audio
          <div className='flex h-48 w-full items-center justify-center rounded-t-xl bg-muted'>
            <div className='text-center text-muted-foreground'>
              <DownloadIcon className='mx-auto mb-2 h-12 w-12' />
              <p className='text-sm'>{t("mods.noPreviewAvailable")}</p>
            </div>
          </div>
        )}
        {!readOnly && (
          <FavoriteButton
            className='absolute top-2 right-2 z-10'
            remoteId={mod.remoteId}
          />
        )}
        {(status === ModStatus.Installed ||
          mod.isObsolete ||
          isModOutdated(mod) ||
          isUpdatedRecently(mod) ||
          isUpdateAvailable(mod, localMod)) && (
          <div className='pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-6'>
            {status === ModStatus.Installed && (
              <Badge>{t("modStatus.installed")}</Badge>
            )}
            {mod.isObsolete && <ObsoleteModWarning variant='indicator' />}
            {isModOutdated(mod) && <OutdatedModWarning variant='indicator' />}
            {isUpdatedRecently(mod) && !isUpdateAvailable(mod, localMod) && (
              <UpdatedRecentlyBadge />
            )}
            {isUpdateAvailable(mod, localMod) && <UpdateAvailableBadge />}
          </div>
        )}
      </div>
      <CardHeader className='px-3 py-4'>
        <div className='flex items-start justify-between'>
          <div className='flex w-full flex-col gap-3'>
            <div className='space-y-1'>
              <CardTitle
                className='overflow-clip text-ellipsis text-nowrap leading-tight'
                title={mod.name}>
                {mod.name}
              </CardTitle>
              <div className='flex flex-wrap items-center gap-1.5'>
                {mod.isMap && (
                  <Badge variant='secondary'>{t("mods.mapBadge")}</Badge>
                )}
                <span
                  className='overflow-clip text-ellipsis text-nowrap text-muted-foreground text-sm'
                  title={mod.author}>
                  {t("mods.by")} {mod.author}
                </span>
              </div>
            </div>

            <div className='flex flex-row justify-between'>
              <div className='flex flex-col gap-1.5'>
                <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                  <div className='flex items-center gap-1.5'>
                    <DownloadIcon className='h-3 w-3 flex-shrink-0' />
                    <span>{mod.downloadCount.toLocaleString()}</span>
                  </div>
                  {mod.likes > 0 && (
                    <div className='flex items-center gap-1.5'>
                      <HeartIcon className='ml-2 h-3 w-3 flex-shrink-0' />
                      <span>{mod.likes.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                  <CalendarIcon className='h-3 w-3 flex-shrink-0' />
                  <span title={format(new Date(mod.remoteUpdatedAt), "PPP")}>
                    {format(new Date(mod.remoteUpdatedAt), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              {!readOnly && <ModButton remoteMod={mod} variant='iconOnly' />}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );

  if (CardWrapper) {
    return <CardWrapper>{cardContent}</CardWrapper>;
  }

  return cardContent;
});

ModCard.displayName = "ModCard";

export default ModCard;
