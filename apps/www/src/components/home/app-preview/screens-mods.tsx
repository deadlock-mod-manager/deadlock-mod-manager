import { Badge } from "@deadlock-mods/ui/components/badge";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CubeIcon,
  DownloadIcon,
  DownloadSimpleIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  MusicNotesIcon,
  PackageIcon,
  SparkleIcon,
  TrashIcon,
  TrendUpIcon,
  BarricadeIcon,
  CardsThreeIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CATEGORY_KEYS, modThumbnail, modById, PREVIEW_MODS } from "./mods";
import { EmptyState, isRecentlyUpdated, ModCard, PageTitle } from "./parts";
import {
  useInstalledMods,
  usePreviewFormat,
  usePreviewState,
} from "./preview-state";
import { usePreviewNavigation } from "./store";

const FEATURED_ID = "691863";

const fieldClassName =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground shadow-sm outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring";

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

const CONTENT_TABS = [
  { id: "mods", icon: CubeIcon },
  { id: "sounds", icon: MusicNotesIcon },
  { id: "albums", icon: CardsThreeIcon },
  { id: "wips", icon: BarricadeIcon },
] as const;

const heroes = [
  ...new Set(PREVIEW_MODS.flatMap((mod) => (mod.hero ? [mod.hero] : []))),
].sort();

export const StoreScreen = () => {
  const { t } = useTranslation("preview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [hero, setHero] = useState("all");
  const [sort, setSort] = useState("default");

  const mods = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = PREVIEW_MODS.filter(
      (mod) =>
        (category === "all" || mod.category === category) &&
        (hero === "all" || mod.hero === hero) &&
        (!needle ||
          mod.name.toLowerCase().includes(needle) ||
          mod.author.toLowerCase().includes(needle)),
    );
    if (sort === "downloads") {
      return [...filtered].sort((a, b) => b.downloads - a.downloads);
    }
    if (sort === "rating") {
      return [...filtered].sort((a, b) => b.likes - a.likes);
    }
    if (sort === "updated") {
      return [...filtered].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    }
    return filtered;
  }, [query, category, hero, sort]);

  return (
    <div className='flex flex-col px-4'>
      <div className='mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border/60 border-b'>
        <PageTitle
          className='pb-3'
          title={t("store.title")}
          subtitle={t("store.subtitle")}
        />
        <div className='-mb-px flex gap-1'>
          {CONTENT_TABS.map((tab, index) => (
            <span
              key={tab.id}
              className={cn(
                "relative flex h-9 items-center gap-2 rounded-md px-3 text-sm after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                index === 0
                  ? "text-foreground after:opacity-100"
                  : "text-muted-foreground after:opacity-0",
              )}>
              <tab.icon
                weight='duotone'
                className={cn("size-4", index === 0 && "text-primary")}
              />
              {t(`store.tabs.${tab.id}`)}
            </span>
          ))}
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <label className='relative min-w-48 max-w-sm flex-1'>
          <span className='sr-only'>{t("store.searchLabel")}</span>
          <MagnifyingGlassIcon className='-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground' />
          <input
            type='search'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("store.searchPlaceholder")}
            className={cn(
              fieldClassName,
              "w-full pl-9 text-foreground placeholder:text-muted-foreground",
            )}
          />
        </label>
        <select
          aria-label={t("store.heroLabel")}
          value={hero}
          onChange={(event) => setHero(event.target.value)}
          className={fieldClassName}>
          <option value='all'>{t("store.allHeroes")}</option>
          {heroes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("store.categoryLabel")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={fieldClassName}>
          <option value='all'>{t("store.allCategories")}</option>
          {Object.entries(CATEGORY_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(`categories.${key}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("store.sortLabel")}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className={cn(fieldClassName, "ml-auto")}>
          <option value='default'>{t("store.sort.default")}</option>
          <option value='updated'>{t("store.sort.updated")}</option>
          <option value='downloads'>{t("store.sort.downloads")}</option>
          <option value='rating'>{t("store.sort.rating")}</option>
        </select>
      </div>

      {mods.length > 0 ? (
        <div className='grid grid-cols-4 gap-4 py-4'>
          {mods.map((mod) => (
            <ModCard key={mod.id} mod={mod} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MagnifyingGlassIcon}
          title={t("store.empty.title")}
          description={t("store.empty.description")}
        />
      )}
    </div>
  );
};

type LibraryTab = "all" | "installed" | "downloaded";

export const LibraryScreen = () => {
  const { t } = useTranslation("preview");
  const { setScreen } = usePreviewNavigation();
  const { installs, toggle, remove, notify } = usePreviewState();
  const installedMods = useInstalledMods();
  const [tab, setTab] = useState<LibraryTab>("all");

  const isEnabled = (id: string) => {
    const install = installs[id];
    return install?.status === "installed" && install.enabled;
  };
  const enabledCount = installedMods.filter((mod) => isEnabled(mod.id)).length;
  const counts = {
    all: installedMods.length,
    installed: enabledCount,
    downloaded: installedMods.length - enabledCount,
  } satisfies Record<LibraryTab, number>;
  const visible = installedMods.filter((mod) =>
    tab === "all" ? true : (tab === "installed") === isEnabled(mod.id),
  );

  return (
    <div className='flex flex-1 flex-col px-4'>
      <div className='flex flex-wrap items-start justify-between gap-3 pt-4'>
        <div>
          <div className='flex items-center gap-3'>
            <h3 className='font-semibold text-2xl tracking-tight'>
              {t("library.title")}
            </h3>
            <span className='inline-flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5 text-sm shadow-sm'>
              <span>
                <Trans
                  t={t}
                  i18nKey='library.count'
                  values={{
                    enabled: enabledCount,
                    total: installedMods.length,
                  }}
                  components={{ strong: <strong className='tabular-nums' /> }}
                />
              </span>
            </span>
          </div>
          <p className='text-muted-foreground'>{t("library.subtitle")}</p>
        </div>
        <button
          type='button'
          onClick={() =>
            notify(
              t("library.upToDate.title"),
              t("library.upToDate.description"),
            )
          }
          className={buttonVariants({ variant: "outline" })}>
          <ArrowsClockwiseIcon />
          {t("library.checkUpdates")}
        </button>
      </div>

      <div
        role='tablist'
        aria-label={t("library.filterLabel")}
        className='mt-4 inline-flex w-fit items-center rounded-lg bg-muted p-1 text-muted-foreground'>
        {(["all", "installed", "downloaded"] as const).map((key) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-1 font-medium text-sm capitalize transition-colors",
              tab === key && "bg-background text-foreground shadow",
            )}>
            {t(`library.tabs.${key}`)}
            <span className='ml-2 text-muted-foreground text-xs tabular-nums'>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {installedMods.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title={t("library.empty.title")}
          description={t("library.empty.description")}>
          <button
            type='button'
            onClick={() => setScreen("store")}
            className={buttonVariants()}>
            <MagnifyingGlassIcon />
            {t("library.empty.action")}
          </button>
        </EmptyState>
      ) : (
        <ul className='flex flex-col gap-3 py-4'>
          {visible.map((mod) => {
            const enabled = isEnabled(mod.id);
            return (
              <li
                key={mod.id}
                className='flex items-center overflow-hidden rounded-xl border bg-card pr-4 shadow'>
                <div className='relative h-24 w-32 shrink-0'>
                  <img
                    src={modThumbnail(mod)}
                    alt=''
                    width={480}
                    height={360}
                    loading='lazy'
                    className={cn(
                      "size-full object-cover transition-[filter]",
                      !enabled && "grayscale",
                    )}
                  />
                  {isRecentlyUpdated(mod) && (
                    <Badge
                      variant='secondary'
                      className='absolute top-1 right-1 text-[10px]'>
                      {t("mod.updated")}
                    </Badge>
                  )}
                </div>
                <div className='min-w-0 flex-1 p-3'>
                  <h4 className='truncate font-semibold text-lg'>{mod.name}</h4>
                  <p className='text-muted-foreground text-sm'>
                    {t("mod.byAuthor", { author: mod.author })}
                  </p>
                </div>
                <div className='flex items-center gap-3'>
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggle(mod.id)}
                    aria-label={t("mod.enable", { name: mod.name })}
                  />
                  <button
                    type='button'
                    onClick={() => remove(mod.id)}
                    aria-label={t("mod.remove", { name: mod.name })}
                    className='inline-flex size-9 items-center justify-center rounded-md bg-destructive/60 text-white transition-colors hover:bg-destructive'>
                    <TrashIcon className='size-4' />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const DownloadsScreen = () => {
  const { t } = useTranslation("preview");
  const { setScreen } = usePreviewNavigation();
  const { installs } = usePreviewState();
  const active = PREVIEW_MODS.flatMap((mod) => {
    const install = installs[mod.id];
    return install?.status === "downloading"
      ? [{ mod, progress: install.progress }]
      : [];
  });

  return (
    <div className='flex flex-1 flex-col px-4'>
      <PageTitle
        title={t("downloads.title")}
        subtitle={t("downloads.subtitle")}
      />
      {active.length === 0 ? (
        <EmptyState
          icon={DownloadSimpleIcon}
          title={t("downloads.empty.title")}
          description={t("downloads.empty.description")}>
          <button
            type='button'
            onClick={() => setScreen("store")}
            className={buttonVariants()}>
            <MagnifyingGlassIcon />
            {t("downloads.empty.action")}
          </button>
        </EmptyState>
      ) : (
        <ul className='flex flex-col gap-3 py-4'>
          {active.map(({ mod, progress }) => (
            <li
              key={mod.id}
              className='flex items-center gap-4 rounded-xl border bg-card p-3'>
              <img
                src={modThumbnail(mod)}
                alt=''
                width={480}
                height={360}
                className='h-14 w-20 rounded-md object-cover'
              />
              <div className='min-w-0 flex-1'>
                <div className='flex justify-between gap-4 text-sm'>
                  <span className='truncate font-medium'>{mod.name}</span>
                  <span className='text-muted-foreground tabular-nums'>
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full origin-left rounded-full bg-primary transition-transform duration-150'
                    style={{ transform: `scaleX(${progress / 100})` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
