import { modContentType } from "@/lib/analytics/schema";
import { analytics } from "@/lib/analytics";
import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  ArrowRightIcon,
  DownloadIcon,
  HeartIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HeroIcon } from "@/components/heroes/hero-icon";
import NSFWBlur, { NSFWBadge } from "@/components/mod-browsing/nsfw-blur";
import { useGlobalAudio, useGlobalAudioStore } from "@/hooks/use-global-audio";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useHeroCatalog } from "@/hooks/use-player-stats";
import { shouldShowNsfwBadgeAlongsideBlurPreview } from "@/lib/nsfw-blur-display";
import { getModCategoryDisplayName } from "@/lib/constants";
import { prefetchModDetail } from "@/lib/mods/mod-detail-prefetch";
import { cn } from "@/lib/utils";

type Props = {
  mod: ModDto;
  isActive: boolean;
};

export const FeaturedModCardSkeleton = () => (
  <div className='relative w-full overflow-hidden rounded-lg border border-primary/30'>
    <Skeleton className='aspect-[21/9] w-full' />
  </div>
);

export const FeaturedModSlide = ({ mod, isActive }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const heroImage = mod.images[0];
  const handleClick = () => {
    analytics.track("catalog_item_opened", {
      mod_id: mod.remoteId,
      entry_point: "featured",
      content_type: modContentType(mod),
    });
    void prefetchModDetail(queryClient, mod.remoteId);
    navigate(`/mods/${mod.remoteId}`, {
      state: { collection: "dashboard", analyticsEntryPoint: "featured" },
    });
  };

  return (
    <div
      className='group relative isolate w-full cursor-pointer overflow-hidden rounded-lg'
      inert={!isActive}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      role='button'
      tabIndex={0}>
      <div className='relative aspect-[21/9] w-full overflow-hidden'>
        {heroImage ? (
          <NSFWBlur
            blurStrength={nsfwSettings.blurStrength}
            className='h-full w-full'
            disableBlur={nsfwSettings.disableBlur}
            isNSFW={shouldBlur}
            onToggleVisibility={handleNSFWToggle}>
            <img
              alt={mod.name}
              className='h-full w-full object-cover object-top'
              decoding='async'
              src={heroImage}
            />
          </NSFWBlur>
        ) : mod.isAudio ? (
          <AudioCover hero={mod.hero} />
        ) : (
          <div className='h-full w-full bg-gradient-to-br from-secondary via-muted to-secondary' />
        )}

        <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/0' />
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-r from-background/80 via-background/10 to-transparent' />
      </div>

      <div className='absolute inset-0 flex flex-col justify-end gap-4 p-8 lg:p-10'>
        <div className='flex items-center gap-2'>
          <SparkleIcon className='size-4 text-primary' weight='duotone' />
          <span
            className='font-bold text-[11px] text-primary uppercase tracking-[0.4em]'
            style={{ fontFamily: '"Forevs Demo", serif' }}>
            {t("dashboard.featuredModOfTheWeek")}
          </span>
        </div>

        <div className='flex max-w-3xl flex-col gap-2'>
          <h2
            className='font-bold text-4xl leading-tight text-foreground tracking-tight lg:text-6xl'
            style={{ fontFamily: '"Forevs Demo", serif' }}>
            {mod.name}
          </h2>
          <p className='text-muted-foreground text-sm lg:text-base'>
            {t("mods.by")}{" "}
            <span className='font-medium text-foreground/80'>{mod.author}</span>
          </p>
          {mod.description && (
            <div className='line-clamp-2 max-w-2xl text-muted-foreground text-sm lg:text-base'>
              <Markup content={mod.description} noHtml tagName='span' />
            </div>
          )}
          {mod.isAudio && mod.audioUrl && (
            <AudioPreview audioUrl={mod.audioUrl} />
          )}
        </div>

        <div className='flex flex-wrap items-center gap-3 pt-1'>
          <CategoryChip category={mod.category} />
          {mod.hero && (
            <span className='flex items-center gap-1.5 font-medium text-foreground/85 text-xs'>
              <HeroIcon className='size-5 rounded-full' hero={mod.hero} />
              {mod.hero}
            </span>
          )}
          {mod.isAudio && (
            <Badge className='bg-card/80' variant='outline'>
              {t("mods.audio")}
            </Badge>
          )}
          {shouldShowNsfwBadgeAlongsideBlurPreview({
            disableBlur: nsfwSettings.disableBlur,
            isNSFW: mod.isNSFW,
            shouldBlur,
          }) && <NSFWBadge />}
          <Stat
            icon={<DownloadIcon className='size-4' weight='duotone' />}
            value={mod.downloadCount.toLocaleString()}
          />
          <Stat
            icon={<HeartIcon className='size-4' weight='duotone' />}
            value={mod.likes.toLocaleString()}
          />
          <div className='ml-auto'>
            <Button
              className='gap-2 text-primary/80 hover:text-primary group-hover:text-primary'
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              size='lg'
              variant='text'>
              {t("dashboard.viewMod")}
              <ArrowRightIcon className='size-4' weight='bold' />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CategoryChip = ({ category }: { category: string }) => (
  <span
    className='border-l-2 border-primary/50 pl-2 font-bold text-foreground/90 text-xs uppercase tracking-[0.2em]'
    style={{ fontFamily: '"Forevs Demo", serif' }}>
    {getModCategoryDisplayName(category)}
  </span>
);

const Stat = ({ icon, value }: { icon: React.ReactNode; value: string }) => (
  <span className='flex items-center gap-1.5 text-muted-foreground text-xs'>
    {icon}
    <span className='font-medium text-foreground/85 tabular-nums'>{value}</span>
  </span>
);

/** Sound submissions ship no screenshots, so the tagged hero's art stands in. */
const AudioCover = ({ hero }: { hero: string | null }) => {
  const { heroByName } = useHeroCatalog();
  const images = hero ? heroByName(hero)?.images : undefined;
  const backdrop = images?.background_image_webp ?? images?.background_image;
  const nameArt = images?.name_image;

  return (
    <div className='relative h-full w-full bg-gradient-to-br from-secondary via-background to-primary/15'>
      {backdrop ? (
        <img
          alt=''
          className='h-full w-full object-cover object-right'
          decoding='async'
          src={backdrop}
        />
      ) : (
        <MusicNotesIcon
          className='-translate-y-1/2 absolute top-1/2 right-[10%] size-64 text-primary/15'
          weight='duotone'
        />
      )}
      {nameArt && (
        <img
          alt=''
          className='-translate-y-1/2 absolute top-[42%] right-[6%] w-[34%] opacity-90'
          src={nameArt}
        />
      )}
    </div>
  );
};

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

const AudioPreview = ({ audioUrl }: { audioUrl: string }) => {
  const { t } = useTranslation();
  const { isPlaying, togglePlayback } = useGlobalAudio(audioUrl, audioUrl);
  const duration = useGlobalAudioStore((s) =>
    s.currentUrl === audioUrl ? s.duration : 0,
  );
  const currentTime = useGlobalAudioStore((s) =>
    s.currentUrl === audioUrl ? s.currentTime : 0,
  );
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <button
      aria-label={isPlaying ? t("mods.pause") : t("mods.preview")}
      className='mt-2 flex w-fit cursor-pointer items-center gap-3 rounded-full border border-primary/30 bg-background/75 py-1.5 pr-5 pl-1.5 transition-colors hover:border-primary/60 hover:bg-background/80'
      onClick={(e) => {
        e.stopPropagation();
        togglePlayback();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      type='button'>
      <span className='flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground'>
        {isPlaying ? (
          <PauseIcon className='size-4' weight='fill' />
        ) : (
          <PlayIcon className='ml-0.5 size-4' weight='fill' />
        )}
      </span>
      <span className='flex h-4 items-end gap-0.5' aria-hidden>
        {[0, 1, 2, 3].map((bar) => (
          <span
            className={cn(
              "w-0.5 origin-bottom rounded-full bg-primary",
              isPlaying ? "featured-eq" : "h-1.5",
            )}
            key={bar}
            style={{ animationDelay: `${bar * -0.27}s` }}
          />
        ))}
      </span>
      <span className='font-medium text-foreground/90 text-sm'>
        {isPlaying ? t("mods.pause") : t("mods.preview")}
      </span>
      <span className='relative h-1 w-32 overflow-hidden rounded-full bg-muted-foreground/25'>
        <span
          className='absolute inset-y-0 left-0 bg-primary'
          style={{ width: `${progress}%` }}
        />
      </span>
      <span className='text-muted-foreground text-xs tabular-nums'>
        {formatTime(currentTime)}
        {duration > 0 && ` / ${formatTime(duration)}`}
      </span>
    </button>
  );
};
