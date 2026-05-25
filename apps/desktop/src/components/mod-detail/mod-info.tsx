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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  Calendar,
  CalendarPlus,
  Download,
  Heart,
  Package,
  Tag,
  User,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useHero } from "@/hooks/use-hero";
import { getModCategoryDisplayName } from "@/lib/constants";
import {
  type ResolvedModHero,
  resolveModHero,
} from "@/lib/mods/hero-resolution";
import { usePersistedStore } from "@/lib/store";
import { DateDisplay } from "../date-display";
import { HeroOverridePicker } from "./hero-override-picker";
import { HeroSourceBadge } from "./hero-source-badge";

interface ModInfoProps {
  mod: ModDto;
  hasHero?: boolean;
  activeArchiveNames?: Set<string>;
  totalDownloads?: number;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const EMPTY_ARCHIVE_NAMES = new Set<string>();

export const ModInfo = ({
  mod,
  hasHero = false,
  activeArchiveNames = EMPTY_ARCHIVE_NAMES,
  totalDownloads = 0,
}: ModInfoProps) => {
  const { t } = useTranslation();
  const showHeader = hasHero ? false : !mod.isAudio;
  const localMod = usePersistedStore((state) =>
    state.localMods.find((m) => m.remoteId === mod.remoteId),
  );

  const resolvedHero = resolveModHero(mod, localMod);
  const showHeroStat = resolvedHero.hero !== null || localMod !== undefined;
  const hasTags = mod.tags && mod.tags.length > 0;
  const hasFileInfo = activeArchiveNames.size > 0 && totalDownloads > 1;
  const statCount = (showHeroStat ? 1 : 0) + 3 + (hasFileInfo ? 1 : 0);
  const gridCols =
    statCount <= 3
      ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
      : statCount === 4
        ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5";

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
          <div className={gridCols}>
            {showHeroStat && (
              <HeroDisplay
                mod={mod}
                resolvedHero={resolvedHero}
                canOverride={localMod !== undefined}
              />
            )}
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
            {hasFileInfo && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <PrimaryStat
                      icon={<Package className='h-4 w-4' />}
                      label={t("modOptions.installedFiles")}
                      value={
                        <span className='truncate font-mono text-xs'>
                          {t("modOptions.installedFilesCount", {
                            count: activeArchiveNames.size,
                            total: totalDownloads,
                          })}
                        </span>
                      }
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className='max-w-sm'>
                  <p className='mb-1.5 text-xs'>
                    {t("modOptions.installedFilesCount", {
                      count: activeArchiveNames.size,
                      total: totalDownloads,
                    })}
                  </p>
                  <ul className='list-none space-y-0.5'>
                    {[...activeArchiveNames].map((name) => (
                      <li key={name} className='font-mono text-xs'>
                        {name}
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <Separator />

          <div className='grid auto-cols-fr grid-flow-col gap-3'>
            <TimelineItem
              icon={<CalendarPlus className='h-3.5 w-3.5' />}
              label={t("modDetail.publishedAt")}
              date={mod.remoteAddedAt}
            />
            <TimelineItem
              icon={<Calendar className='h-3.5 w-3.5' />}
              label={t("modDetail.lastModifiedAt")}
              date={mod.remoteUpdatedAt}
            />
            {localMod?.downloadedAt != null && (
              <TimelineItem
                icon={<Download className='h-3.5 w-3.5' />}
                label={t("modDetail.installedAt")}
                date={localMod.downloadedAt}
              />
            )}
          </div>

          {hasTags && <Separator />}

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
        </div>
      </CardContent>
    </>
  );
};

interface HeroDisplayProps {
  mod: ModDto;
  resolvedHero: ResolvedModHero;
  canOverride: boolean;
}

const HeroDisplay = ({ mod, resolvedHero, canOverride }: HeroDisplayProps) => {
  const { t } = useTranslation();
  const name =
    resolvedHero.hero ??
    t("modDetail.generalOther", { defaultValue: "General/Other" });
  const { data: hero } = useHero(resolvedHero.hero ?? "");
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
        <span className='flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide'>
          {t("modDetail.detectedHero")}
          <HeroSourceBadge source={resolvedHero.source} />
        </span>
        <span className='truncate font-medium text-foreground text-sm'>
          {name}
        </span>
      </div>
      {canOverride && (
        <HeroOverridePicker
          remoteId={mod.remoteId}
          resolvedHero={resolvedHero}
        />
      )}
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
    <div className='flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-sm'>
      <span className='text-muted-foreground/60'>{icon}</span>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <span className='text-muted-foreground/70 text-[11px] uppercase tracking-wider'>
          {label}
        </span>
        <DateDisplay className='text-foreground/80 text-xs' date={date} />
      </div>
    </div>
  );
};
