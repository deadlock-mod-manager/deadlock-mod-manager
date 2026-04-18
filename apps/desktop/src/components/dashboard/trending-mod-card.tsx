import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { DownloadIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";

type Props = {
  mod: ModDto;
};

export const TrendingModCard = ({ mod }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const heroImage = mod.images[0];
  const handleClick = () => navigate(`/mods/${mod.remoteId}`);

  return (
    <div
      className='group relative w-56 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border/30 bg-card transition-all duration-300 hover:border-primary/60'
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      role='button'
      tabIndex={0}>
      <div className='relative aspect-[4/3] w-full overflow-hidden'>
        {mod.isAudio ? (
          <AudioPlayerPreview
            audioUrl={mod.audioUrl || ""}
            onPlayClick={(e) => e.stopPropagation()}
            variant='compact'
          />
        ) : heroImage ? (
          <NSFWBlur
            blurStrength={nsfwSettings.blurStrength}
            className='h-full w-full'
            disableBlur={nsfwSettings.disableBlur}
            isNSFW={shouldBlur}
            onToggleVisibility={handleNSFWToggle}
            showControls={false}>
            <img
              alt={mod.name}
              className='h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105'
              loading='lazy'
              src={heroImage}
            />
          </NSFWBlur>
        ) : (
          <div className='h-full w-full bg-gradient-to-br from-secondary via-muted to-secondary' />
        )}
        {mod.isNSFW && (
          <div className='absolute right-1.5 top-1.5 flex flex-col gap-1'>
            <Badge className='bg-card/85 text-[10px]'>NSFW</Badge>
          </div>
        )}
      </div>
      <div className='space-y-1 p-3'>
        <p
          className='line-clamp-1 font-semibold text-sm transition-colors group-hover:text-primary'
          title={mod.name}>
          {mod.name}
        </p>
        <p className='line-clamp-1 text-muted-foreground text-xs'>
          {t("mods.by")} {mod.author}
        </p>
        <div className='flex items-center gap-1 pt-1 text-[0.6875rem] text-muted-foreground'>
          <DownloadIcon className='size-3' />
          <span className='tabular-nums'>
            {mod.downloadCount.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export const TrendingModCardSkeleton = () => (
  <div className='w-56 shrink-0 overflow-hidden rounded-lg border border-border/30 bg-card'>
    <div className='aspect-[4/3] w-full animate-pulse bg-muted' />
    <div className='space-y-2 p-3'>
      <div className='h-3.5 w-3/4 animate-pulse rounded bg-muted' />
      <div className='h-3 w-1/2 animate-pulse rounded bg-muted' />
    </div>
  </div>
);
