import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  ArrowRightIcon,
  DownloadIcon,
  HeartIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCategoryDisplayName } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Props = {
  mod: ModDto | undefined;
  isLoading?: boolean;
};

const FeaturedModCardSkeleton = () => (
  <div className='relative w-full overflow-hidden rounded-lg border border-primary/30'>
    <Skeleton className='aspect-[21/9] w-full' />
  </div>
);

export const FeaturedModCard = ({ mod, isLoading }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  if (isLoading || !mod) {
    return <FeaturedModCardSkeleton />;
  }

  const heroImage = mod.images[0];
  const handleClick = () => navigate(`/mods/${mod.remoteId}`);

  return (
    <div
      className='group relative isolate w-full cursor-pointer overflow-hidden rounded-lg'
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
            onToggleVisibility={handleNSFWToggle}
            showControls={false}>
            <img
              alt={mod.name}
              className={cn(
                "h-full w-full object-cover transition-transform duration-700 ease-out",
                "motion-safe:group-hover:scale-105",
              )}
              loading='eager'
              src={heroImage}
            />
          </NSFWBlur>
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
        </div>

        <div className='flex flex-wrap items-center gap-3 pt-1'>
          <CategoryChip category={mod.category} />
          {mod.isAudio && (
            <Badge className='bg-card/80' variant='outline'>
              {t("mods.audio")}
            </Badge>
          )}
          {mod.isNSFW && (
            <Badge className='bg-card/80' variant='outline'>
              NSFW
            </Badge>
          )}
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
              className='gap-2'
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              size='lg'>
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
