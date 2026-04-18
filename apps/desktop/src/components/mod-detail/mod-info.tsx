import type { ModDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Calendar,
  CalendarPlus,
  Download,
  Hash,
  Heart,
  Tag,
  User,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useHero } from "@/hooks/use-hero";
import { getModCategoryDisplayName } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { DateDisplay } from "../date-display";

interface ModInfoProps {
  mod: ModDto;
  hasHero?: boolean;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

export const ModInfo = ({ mod, hasHero = false }: ModInfoProps) => {
  const { t } = useTranslation();
  const showHeader = hasHero ? false : !mod.isAudio;
  const localMods = usePersistedStore((state) => state.localMods);
  const localMod = localMods.find((m) => m.remoteId === mod.remoteId);

  const heroLabel = localMod?.detectedHero ?? null;
  const hasTags = mod.tags && mod.tags.length > 0;

  return (
    <>
      {showHeader && (
        <CardHeader>
          <CardTitle className='text-3xl'>{mod.name}</CardTitle>
          <CardDescription className='flex flex-wrap items-center gap-2'>
            <span>{getModCategoryDisplayName(mod.category)}</span>
          </CardDescription>
        </CardHeader>
      )}

      <CardContent className={hasHero || mod.isAudio ? "" : "pt-6"}>
        <div className='space-y-5'>
          <div
            className={
              heroLabel
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-1 gap-3 sm:grid-cols-3"
            }>
            {heroLabel && <HeroDisplay name={heroLabel} />}
            <PrimaryStat
              icon={<User className='h-4 w-4' />}
              label={t("modDetail.authorLabel")}
              value={mod.author}
            />
            <PrimaryStat
              icon={<Download className='h-4 w-4' />}
              label={t("modDetail.downloadsLabel")}
              value={
                <span className='font-mono tabular-nums'>
                  {formatNumber(mod.downloadCount)}
                </span>
              }
            />
            <PrimaryStat
              icon={<Heart className='h-4 w-4' />}
              label={t("modDetail.likesLabel")}
              value={
                <span className='font-mono tabular-nums'>
                  {formatNumber(mod.likes)}
                </span>
              }
            />
          </div>

          <Separator />

          <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-sm'>
            <TimelineItem
              icon={<CalendarPlus className='h-3.5 w-3.5' />}
              label={t("modDetail.publishedAt")}
              date={mod.remoteAddedAt}
            />
            <Separator className='hidden h-4 sm:block' orientation='vertical' />
            <TimelineItem
              icon={<Calendar className='h-3.5 w-3.5' />}
              label={t("modDetail.lastModifiedAt")}
              date={mod.remoteUpdatedAt}
            />
            {localMod?.downloadedAt != null && (
              <>
                <Separator
                  className='hidden h-4 sm:block'
                  orientation='vertical'
                />
                <TimelineItem
                  icon={<Download className='h-3.5 w-3.5' />}
                  label={t("modDetail.installedAt")}
                  date={localMod.downloadedAt}
                />
              </>
            )}
          </div>

          {hasTags && <Separator />}

          <div className='flex flex-wrap items-center justify-between gap-3'>
            {hasTags && (
              <div className='flex flex-wrap items-center gap-2'>
                <Tag className='h-4 w-4 text-muted-foreground' />
                {mod.tags?.map((tag) => (
                  <Badge key={tag} variant='secondary'>
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
              <Hash className='h-3 w-3' />
              <span className='font-mono tabular-nums'>
                {t("modDetail.idLabel")}: {mod.remoteId}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </>
  );
};

interface HeroDisplayProps {
  name: string;
}

const HeroDisplay = ({ name }: HeroDisplayProps) => {
  const { t } = useTranslation();
  const { data: hero } = useHero(name);
  const imageSrc =
    hero?.images.icon_hero_card_webp ??
    hero?.images.icon_hero_card ??
    hero?.images.icon_image_small_webp ??
    hero?.images.icon_image_small;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className='group flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60'>
      <Avatar className='h-8 w-8 shrink-0 ring-1 ring-border/60'>
        {imageSrc && <AvatarImage alt={name} src={imageSrc} />}
        <AvatarFallback className='text-xs'>{initial}</AvatarFallback>
      </Avatar>
      <div className='flex min-w-0 flex-col'>
        <span className='text-muted-foreground text-xs uppercase tracking-wide'>
          {t("modDetail.detectedHero")}
        </span>
        <span className='truncate font-medium text-foreground text-sm'>
          {name}
        </span>
      </div>
    </div>
  );
};

interface PrimaryStatProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

const PrimaryStat = ({ icon, label, value }: PrimaryStatProps) => (
  <div className='group flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60'>
    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground'>
      {icon}
    </div>
    <div className='flex min-w-0 flex-col'>
      <span className='text-muted-foreground text-xs uppercase tracking-wide'>
        {label}
      </span>
      <span className='truncate font-medium text-sm text-foreground'>
        {value}
      </span>
    </div>
  </div>
);

interface TimelineItemProps {
  icon: React.ReactNode;
  label: string;
  date: Date | undefined | null;
}

const TimelineItem = ({ icon, label, date }: TimelineItemProps) => {
  if (!date) {
    return null;
  }
  return (
    <div className='flex items-center gap-2 text-muted-foreground'>
      <span className='text-muted-foreground/70'>{icon}</span>
      <span className='font-medium text-foreground/80 text-xs uppercase tracking-wide'>
        {label}
      </span>
      <DateDisplay className='text-foreground text-sm' date={date} />
    </div>
  );
};
