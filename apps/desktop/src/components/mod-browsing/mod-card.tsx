import { analyticsClient, rememberModEntryPoint } from "@/lib/analytics";
import type { AnalyticsEntryPoint } from "@/lib/analytics/client";
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
import { useModHasUpdate } from "@/hooks/use-check-updates";
import { useModDetailHoverPrefetch } from "@/hooks/use-mod-detail-hover-prefetch";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import type {
  AlbumNavigationTarget,
  AuthorNavigationTarget,
  ModsCollection,
} from "@/lib/mods/mod-detail-navigation";
import { prefetchModDetail } from "@/lib/mods/mod-detail-prefetch";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { cn, isModOutdated, isUpdatedRecently } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import FavoriteButton from "./favorite-button";
import ModButton from "./mod-button";
import { NSFWBlur } from "./nsfw-blur";

interface ModCardProps {
  mod?: ModDto;
  readOnly?: boolean;
  collection?: ModsCollection;
  author?: AuthorNavigationTarget;
  album?: AlbumNavigationTarget;
}

const ModCard = memo((props: ModCardProps) => {
  const { mod, readOnly = false, collection = "mods", author, album } = props;
  const { t } = useTranslation();
  const localMod = usePersistedStore((state) =>
    findLocalMod(state.localMods, mod?.remoteId),
  );
  const hasUpdate = useModHasUpdate(localMod);
  const CardWrapper = useThemeOverride("cardWrapper");

  const status = localMod?.status;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);
  const hoverPrefetch = useModDetailHoverPrefetch(
    readOnly ? undefined : mod?.remoteId,
  );

  if (!mod) {
    return <ModCardSkeleton />;
  }

  const openModDetail = () => {
    const entryPoint: AnalyticsEntryPoint = album
      ? "album"
      : author
        ? "author"
        : collection === "dashboard"
          ? "featured"
          : collection === "library"
            ? "library"
            : usePersistedStore.getState().modsFilters.searchQuery
              ? "search"
              : "catalog";
    rememberModEntryPoint(mod.remoteId, entryPoint);
    analyticsClient.capture("catalog_item_opened", {
      mod_id: mod.remoteId,
      entry_point: entryPoint,
      content_type: mod.isMap ? "map" : mod.isAudio ? "sound" : "mod",
    });
    void prefetchModDetail(queryClient, mod.remoteId);
    navigate(`/mods/${mod.remoteId}`, {
      state: { collection, author, album },
    });
  };

  const modAuthorId = mod.modAuthorId;
  const showAuthorLink = !readOnly && modAuthorId !== null && !author;
  const coverImage = getModCoverImage(mod);

  const cardContent = (
    <Card
      className={cn(
        "group shadow-none border [contain:layout_style_paint] h-full",
        !readOnly && "cursor-pointer",
      )}
      onPointerEnter={hoverPrefetch.onPointerEnter}
      onPointerLeave={hoverPrefetch.onPointerLeave}
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
        ) : coverImage ? (
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
              src={coverImage}
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
          hasUpdate) && (
          <div className='pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-6'>
            {status === ModStatus.Installed && (
              <Badge>{t("modStatus.installed")}</Badge>
            )}
            {mod.isObsolete && <ObsoleteModWarning variant='indicator' />}
            {isModOutdated(mod) && <OutdatedModWarning variant='indicator' />}
            {isUpdatedRecently(mod) && !hasUpdate && <UpdatedRecentlyBadge />}
            {hasUpdate && <UpdateAvailableBadge />}
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
                {showAuthorLink ? (
                  <button
                    aria-label={t("mods.showMoreByAuthor", {
                      author: mod.author,
                    })}
                    className='overflow-clip text-ellipsis text-nowrap rounded-sm text-left text-muted-foreground text-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/authors/${modAuthorId}`, {
                        state: { collection },
                      });
                    }}
                    title={t("mods.showMoreByAuthor", { author: mod.author })}
                    type='button'>
                    {t("mods.by")} {mod.author}
                  </button>
                ) : (
                  <span
                    className='overflow-clip text-ellipsis text-nowrap text-muted-foreground text-sm'
                    title={mod.author}>
                    {t("mods.by")} {mod.author}
                  </span>
                )}
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
