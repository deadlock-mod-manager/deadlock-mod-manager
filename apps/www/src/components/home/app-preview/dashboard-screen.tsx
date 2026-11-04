import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  DownloadIcon,
  DownloadSimpleIcon,
  HeartIcon,
  PackageIcon,
  SparkleIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { Trans, useTranslation } from "react-i18next";
import { CATEGORY_KEYS, modById, modThumbnail, PREVIEW_MODS } from "./mods";
import { PageTitle } from "./parts";
import {
  useInstalledMods,
  usePreviewFormat,
  usePreviewState,
} from "./preview-state";
import { usePreviewNavigation } from "./store";

const FEATURED_ID = "691863";

export const DashboardScreen = () => {
  const { t } = useTranslation("preview");
  const { formatCount } = usePreviewFormat();
  const { setScreen } = usePreviewNavigation();
  const { installs } = usePreviewState();
  const featured = modById(FEATURED_ID);
  const trending = PREVIEW_MODS.filter(
    (mod) => mod.category === "Skins" && mod.id !== FEATURED_ID,
  );
  const installed = useInstalledMods().length;
  const queued = Object.values(installs).length - installed;

  return (
    <div className='flex flex-col gap-3'>
      <PageTitle
        className='px-6'
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
      />
      <div className='space-y-8 px-6 pb-8'>
        {featured && (
          <article className='group relative isolate overflow-hidden rounded-lg'>
            <div className='relative aspect-[21/9] overflow-hidden'>
              <img
                src='/home/mods/featured.webp'
                alt=''
                width={1400}
                height={600}
                className='size-full object-cover object-top transition-transform duration-700 group-hover:scale-105'
              />
              <div className='absolute inset-0 bg-linear-to-t from-background via-background/70 to-background/0' />
              <div className='absolute inset-0 bg-linear-to-r from-background/80 via-background/10 to-transparent' />
            </div>
            <div className='absolute inset-0 flex flex-col justify-end gap-3 p-8'>
              <div className='flex items-center gap-2'>
                <SparkleIcon weight='duotone' className='size-4 text-primary' />
                <span className='font-bold font-primary text-[11px] text-primary uppercase tracking-[0.4em]'>
                  {t("dashboard.featured")}
                </span>
              </div>
              <h4 className='font-bold font-primary text-5xl leading-tight tracking-tight'>
                {featured.name}
              </h4>
              <p className='text-muted-foreground text-sm'>
                <Trans
                  t={t}
                  i18nKey='dashboard.featuredBy'
                  values={{ author: featured.author }}
                  components={{
                    author: <span className='font-medium text-foreground/80' />,
                  }}
                />
              </p>
              {/* The mod's own description from GameBanana, left as written. */}
              <p className='line-clamp-2 max-w-xl text-muted-foreground text-sm'>
                This redesign reimagines Yamato with a stronger focus on her
                lore, emphasizing her role as the leader of a powerful criminal
                family.
              </p>
              <div className='flex flex-wrap items-center gap-3 pt-1'>
                <span className='border-primary/50 border-l-2 pl-2 font-bold font-primary text-xs uppercase tracking-[0.2em]'>
                  {t(`categories.${CATEGORY_KEYS[featured.category]}`)}
                </span>
                <span className='flex items-center gap-1.5 font-medium text-foreground/85 text-xs tabular-nums'>
                  <DownloadIcon className='size-4' />
                  {formatCount(featured.downloads)}
                </span>
                <span className='flex items-center gap-1.5 font-medium text-foreground/85 text-xs tabular-nums'>
                  <HeartIcon className='size-4' />
                  {formatCount(featured.likes)}
                </span>
                <button
                  type='button'
                  onClick={() => setScreen("store")}
                  className='ml-auto inline-flex items-center gap-2 font-medium text-primary/80 text-sm transition-colors hover:text-primary'>
                  {t("dashboard.viewMod")}
                  <ArrowRightIcon weight='bold' className='size-4' />
                </button>
              </div>
            </div>
          </article>
        )}

        <div className='flex flex-wrap items-stretch'>
          {[
            {
              label: t("dashboard.stats.installed"),
              value: installed,
              icon: PackageIcon,
            },
            {
              label: t("dashboard.stats.updates"),
              value: 0,
              icon: ArrowsClockwiseIcon,
            },
            {
              label: t("dashboard.stats.inQueue"),
              value: queued,
              icon: DownloadIcon,
            },
          ].map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                "flex min-w-[140px] items-center gap-3 px-4 py-2.5",
                index > 0 && "border-border/40 border-l",
              )}>
              <stat.icon
                weight='duotone'
                className='size-5 text-muted-foreground'
              />
              <div>
                <div className='font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-wider'>
                  {stat.label}
                </div>
                <div className='font-bold text-xl tabular-nums'>
                  {stat.value}
                </div>
              </div>
            </div>
          ))}
          <div className='flex flex-1 items-center justify-end'>
            <button
              type='button'
              onClick={() => setScreen("store")}
              className={cn(buttonVariants(), "h-8 px-3 text-xs")}>
              {t("dashboard.browseStore")}
              <ArrowRightIcon />
            </button>
          </div>
        </div>

        <section className='space-y-3'>
          <h4 className='flex items-center gap-2 font-bold font-primary text-2xl tracking-tight'>
            <TrendUpIcon weight='duotone' className='size-5 text-primary' />
            <Trans
              t={t}
              i18nKey='dashboard.trending'
              values={{ category: t("categories.skins") }}
              components={{ accent: <span className='text-primary' /> }}
            />
          </h4>
          <div className='-mx-1 flex gap-6 overflow-x-auto px-1 pb-2 [scrollbar-width:none]'>
            {trending.map((mod) => (
              <button
                key={mod.id}
                type='button'
                onClick={() => setScreen("store")}
                className='group w-56 shrink-0 overflow-hidden rounded-lg border border-border/30 bg-card text-left transition-colors hover:border-primary/60'>
                <div className='overflow-hidden'>
                  <img
                    src={modThumbnail(mod)}
                    alt=''
                    width={480}
                    height={360}
                    loading='lazy'
                    className='aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105'
                  />
                </div>
                <div className='space-y-1 p-3'>
                  <div className='line-clamp-1 font-semibold text-sm group-hover:text-primary'>
                    {mod.name}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {t("mod.byAuthor", { author: mod.author })}
                  </div>
                  <div className='flex items-center gap-1 pt-1 text-[0.6875rem] text-muted-foreground tabular-nums'>
                    <DownloadSimpleIcon className='size-3' />
                    {formatCount(mod.downloads)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
