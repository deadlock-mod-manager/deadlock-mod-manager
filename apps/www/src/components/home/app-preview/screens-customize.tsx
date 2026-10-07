import {
  type CrosshairConfig,
  DEFAULT_CROSSHAIR_CONFIG,
} from "@deadlock-mods/crosshair/types";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CellSignalFullIcon,
  CheckIcon,
  CrosshairIcon,
  GameControllerIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrosshairCanvas } from "@/components/crosshair/crosshair-canvas";
import { heroIcon, modById, modThumbnail } from "./mods";
import { EmptyState, PageTitle } from "./parts";
import { useInstalledMods, usePreviewState } from "./preview-state";
import { type ScreenId, usePreviewNavigation } from "./store";

const SWATCHES = [
  { id: "white", color: { r: 255, g: 255, b: 255 } },
  { id: "gold", color: { r: 239, g: 224, b: 190 } },
  { id: "green", color: { r: 74, g: 222, b: 128 } },
  { id: "cyan", color: { r: 34, g: 211, b: 238 } },
  { id: "pink", color: { r: 255, g: 140, b: 192 } },
] as const;

const SLIDERS: {
  key: "gap" | "width" | "height" | "dotOpacity";
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "gap", min: -10, max: 20, step: 1 },
  { key: "width", min: 1, max: 12, step: 1 },
  { key: "height", min: 2, max: 40, step: 1 },
  { key: "dotOpacity", min: 0, max: 1, step: 0.05 },
];

export const CrosshairsScreen = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  const [config, setConfig] = useState<CrosshairConfig>({
    ...DEFAULT_CROSSHAIR_CONFIG,
    gap: 4,
    width: 3,
    height: 12,
    color: SWATCHES[1].color,
  });

  return (
    <div className='px-5 pb-6'>
      <div className='mb-6 flex items-end justify-between'>
        <PageTitle
          title={t("crosshairs.title")}
          subtitle={t("crosshairs.subtitle")}
        />
        <button
          type='button'
          onClick={() =>
            notify(
              t("crosshairs.applied.title"),
              t("crosshairs.applied.description"),
            )
          }
          className={buttonVariants()}>
          <CrosshairIcon />
          {t("crosshairs.apply")}
        </button>
      </div>
      <div className='grid grid-cols-2 gap-6'>
        <div className='space-y-5 rounded-lg border bg-card p-5'>
          <h4 className='font-semibold'>{t("crosshairs.settings")}</h4>
          {SLIDERS.map((slider) => (
            <label key={slider.key} className='block space-y-2'>
              <span className='flex justify-between text-sm'>
                {t(`crosshairs.sliders.${slider.key}`)}
                <span className='text-muted-foreground tabular-nums'>
                  {config[slider.key]}
                </span>
              </span>
              <input
                type='range'
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={config[slider.key]}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    [slider.key]: Number(event.target.value),
                  }))
                }
                className='w-full accent-[hsl(var(--primary))]'
              />
            </label>
          ))}
          <fieldset className='space-y-2'>
            <legend className='mb-2 text-sm'>{t("crosshairs.color")}</legend>
            <div className='flex gap-2'>
              {SWATCHES.map((swatch) => {
                const selected =
                  swatch.color.r === config.color.r &&
                  swatch.color.g === config.color.g &&
                  swatch.color.b === config.color.b;
                return (
                  <button
                    key={swatch.id}
                    type='button'
                    aria-label={t(`crosshairs.swatches.${swatch.id}`)}
                    aria-pressed={selected}
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        color: swatch.color,
                      }))
                    }
                    className={cn(
                      "size-8 rounded-md border-2 transition-transform hover:scale-105",
                      selected ? "border-foreground" : "border-transparent",
                    )}
                    style={{
                      backgroundColor: `rgb(${swatch.color.r} ${swatch.color.g} ${swatch.color.b})`,
                    }}
                  />
                );
              })}
            </div>
          </fieldset>
        </div>
        <div>
          <h4 className='mb-3 font-semibold'>{t("crosshairs.preview")}</h4>
          <div className='overflow-hidden rounded-lg bg-zinc-800 p-4'>
            <CrosshairCanvas config={config} background='bg1' />
          </div>
          <p className='mt-2 text-muted-foreground text-xs'>
            {t("crosshairs.aimHint")}
          </p>
        </div>
      </div>
    </div>
  );
};

const HEROES = [
  "Yamato",
  "Celeste",
  "Billy",
  "Holliday",
  "Ivy",
  "Lash",
  "Shiv",
  "Viscous",
  "Vyper",
  "Wraith",
  "Abrams",
  "Haze",
  "Infernus",
  "Mina",
];

export const SkinsScreen = () => {
  const { t } = useTranslation("preview");
  const { setScreen } = usePreviewNavigation();
  const { activeSkins, setActiveSkin, setEnabled } = usePreviewState();
  const installedSkins = useInstalledMods().filter(
    (mod) => mod.category === "Skins",
  );
  const [selected, setSelected] = useState("Yamato");
  const skinsFor = (hero: string) =>
    installedSkins.filter((mod) => mod.hero === hero);
  const skins = skinsFor(selected);
  const active = activeSkins[selected] ?? null;

  const choose = (id: string | null) => {
    setActiveSkin(selected, id);
    for (const skin of skins) setEnabled(skin.id, skin.id === id);
  };

  return (
    <div className='flex h-full flex-col pr-2 pl-4'>
      <PageTitle
        className='mb-6'
        title={t("skins.title")}
        subtitle={t("skins.subtitle")}
      />
      <div className='flex min-h-0 flex-1 gap-4'>
        <ul className='flex w-60 shrink-0 flex-col gap-1 overflow-y-auto pb-4'>
          {HEROES.map((hero) => {
            const count = skinsFor(hero).length;
            const activeSkinId = activeSkins[hero];
            const activeSkin = activeSkinId ? modById(activeSkinId) : undefined;
            return (
              <li key={hero}>
                <button
                  type='button'
                  aria-pressed={hero === selected}
                  onClick={() => setSelected(hero)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent",
                    hero === selected && "bg-accent",
                  )}>
                  <img
                    src={heroIcon(hero)}
                    alt=''
                    width={36}
                    height={36}
                    loading='lazy'
                    className={cn(
                      "size-9 shrink-0 rounded-full bg-muted object-cover",
                      count === 0 && "opacity-50 grayscale",
                    )}
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate font-medium text-sm'>
                      {hero}
                    </span>
                    <span className='block truncate text-muted-foreground text-xs'>
                      {count === 0
                        ? t("skins.noneDownloaded")
                        : (activeSkin?.name ?? t("skins.default"))}
                    </span>
                  </span>
                  {count > 0 && (
                    <span className='rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums'>
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className='flex-1 overflow-y-auto pr-2 pb-4'>
          <div className='mb-4'>
            <h4 className='font-semibold text-xl'>{selected}</h4>
            <p className='text-muted-foreground text-sm'>
              {t("skins.downloaded", { count: skins.length })}
            </p>
          </div>
          {skins.length === 0 ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title={t("skins.empty.title", { hero: selected })}
              description={t("skins.empty.description")}>
              <button
                type='button'
                onClick={() => setScreen("store")}
                className={buttonVariants()}>
                {t("skins.empty.action", { hero: selected })}
              </button>
            </EmptyState>
          ) : (
            <div className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'>
              {[null, ...skins].map((skin) => {
                const isActive = (skin?.id ?? null) === active;
                return (
                  <button
                    key={skin?.id ?? "default"}
                    type='button'
                    aria-pressed={isActive}
                    onClick={() => choose(skin?.id ?? null)}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary",
                      isActive && "ring-2 ring-primary",
                    )}>
                    {skin ? (
                      <img
                        src={modThumbnail(skin)}
                        alt=''
                        width={480}
                        height={360}
                        className='h-32 w-full object-cover'
                      />
                    ) : (
                      <div className='h-32 bg-muted' />
                    )}
                    <div className='flex justify-between gap-2 p-3'>
                      <div className='min-w-0'>
                        <div className='truncate font-medium text-sm'>
                          {skin?.name ?? t("skins.default")}
                        </div>
                        <div className='truncate text-muted-foreground text-xs'>
                          {skin
                            ? t("mod.byAuthor", { author: skin.author })
                            : t("skins.vanilla")}
                        </div>
                      </div>
                      {isActive && (
                        <CheckIcon
                          weight='bold'
                          className='size-4 shrink-0 text-primary'
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Community servers as they appeared in the browser; player counts and ping
// are illustrative.
const SERVERS = [
  {
    name: "DoomLock EU Unranked",
    players: 18,
    max: 24,
    map: "street_test",
    ping: 38,
    region: "EU",
    locked: false,
    verified: true,
    mods: 2,
  },
  {
    name: "DoomLock NA Unranked",
    players: 22,
    max: 24,
    map: "street_test",
    ping: 112,
    region: "NA",
    locked: false,
    verified: true,
    mods: 2,
  },
  {
    name: "Bubbles Rift Roulette (Rat King is enabled)",
    players: 9,
    max: 12,
    map: "dl_midtown",
    ping: 54,
    region: "EU",
    locked: false,
    verified: false,
    mods: 5,
  },
  {
    name: "HeroLock (help) [US East]",
    players: 4,
    max: 32,
    map: "dl_midtown",
    ping: 96,
    region: "NA",
    locked: false,
    verified: true,
    mods: 0,
  },
  {
    name: "leaf's Puddle Punch Squad Tag",
    players: 6,
    max: 8,
    map: "dl_hideout",
    ping: 71,
    region: "EU",
    locked: true,
    verified: false,
    mods: 3,
  },
  {
    name: "DoomLock DEV SERVER",
    players: 1,
    max: 24,
    map: "street_test",
    ping: 140,
    region: "NA",
    locked: true,
    verified: false,
    mods: 2,
  },
  {
    name: "TinyPM Deadlock",
    players: 12,
    max: 12,
    map: "dl_midtown",
    ping: 47,
    region: "EU",
    locked: false,
    verified: false,
    mods: 1,
  },
];

const pingClassName = (ping: number) =>
  ping < 60
    ? "text-emerald-400"
    : ping < 120
      ? "text-amber-400"
      : "text-rose-400";

export const ServersScreen = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  const [selected, setSelected] = useState(SERVERS[0].name);
  const server = SERVERS.find((candidate) => candidate.name === selected);

  return (
    <div className='flex h-full flex-col gap-4 pr-2 pb-4 pl-4'>
      <PageTitle title={t("servers.title")} subtitle={t("servers.subtitle")} />
      <div className='flex min-h-0 flex-1 gap-4'>
        <div className='min-w-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-card'>
          <table className='w-full border-separate border-spacing-0 text-sm'>
            <thead>
              <tr className='text-left font-semibold text-[10px] text-muted-foreground uppercase tracking-wider'>
                <th className='border-border/60 border-b px-3 py-2'>
                  {t("servers.columns.name")}
                </th>
                <th className='w-[110px] border-border/60 border-b px-3 py-2 text-right'>
                  {t("servers.columns.players")}
                </th>
                <th className='w-[130px] border-border/60 border-b px-3 py-2'>
                  {t("servers.columns.map")}
                </th>
                <th className='w-[90px] border-border/60 border-b px-3 py-2 text-center'>
                  {t("servers.columns.ping")}
                </th>
              </tr>
            </thead>
            <tbody>
              {SERVERS.map((row) => {
                const fill = row.players / row.max;
                const isSelected = row.name === selected;
                return (
                  <tr
                    key={row.name}
                    onClick={() => setSelected(row.name)}
                    className={cn(
                      "cursor-pointer hover:bg-card/60 hover:shadow-[inset_2px_0_0_hsl(var(--primary))]",
                      isSelected &&
                        "bg-primary/5 shadow-[inset_2px_0_0_hsl(var(--primary))]",
                    )}>
                    <td className='border-border/40 border-b px-3 py-2.5'>
                      <button
                        type='button'
                        onClick={() => setSelected(row.name)}
                        className='flex items-center gap-1.5 text-left font-medium'>
                        {row.name}
                        {row.locked && (
                          <LockKeyIcon
                            weight='fill'
                            className='size-3.5 text-amber-400'
                          />
                        )}
                        {row.verified && (
                          <ShieldCheckIcon
                            weight='fill'
                            className='size-3.5 text-sky-400'
                          />
                        )}
                      </button>
                      {row.mods > 0 && (
                        <span className='mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground'>
                          <PuzzlePieceIcon className='size-3' />
                          {t("servers.requiredModsBadge", { total: row.mods })}
                        </span>
                      )}
                    </td>
                    <td className='border-border/40 border-b px-3 py-2.5 text-right'>
                      <span className='inline-flex items-center gap-1 font-mono tabular-nums'>
                        <UsersThreeIcon className='size-3.5 text-muted-foreground' />
                        {row.players}
                        <span className='text-muted-foreground'>
                          /{row.max}
                        </span>
                      </span>
                      <div className='mt-1.5 h-1 rounded-full bg-muted/60'>
                        <div
                          className={cn(
                            "h-full rounded-full",
                            fill >= 1
                              ? "bg-rose-400"
                              : fill >= 0.75
                                ? "bg-amber-400"
                                : "bg-emerald-400",
                          )}
                          style={{ width: `${fill * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className='border-border/40 border-b px-3 py-2.5 text-muted-foreground'>
                      <span className='inline-flex items-center gap-1 font-mono text-xs'>
                        <MapPinIcon
                          weight='fill'
                          className='size-3 opacity-60'
                        />
                        {row.map}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "border-border/40 border-b px-3 py-2.5 text-center",
                        pingClassName(row.ping),
                      )}>
                      <span className='inline-flex items-center gap-1 text-xs tabular-nums'>
                        <CellSignalFullIcon
                          weight='bold'
                          className='size-3.5'
                        />
                        {t("servers.ping", { ping: row.ping })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {server && (
          <aside className='flex w-64 shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-card p-4'>
            <div className='font-semibold'>{server.name}</div>
            <dl className='grid grid-cols-2 gap-y-2 text-xs'>
              <dt className='text-muted-foreground'>
                {t("servers.details.map")}
              </dt>
              <dd className='font-mono'>{server.map}</dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.players")}
              </dt>
              <dd className='tabular-nums'>
                {server.players}/{server.max}
              </dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.region")}
              </dt>
              <dd>{server.region}</dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.requiredMods")}
              </dt>
              <dd>{server.mods}</dd>
            </dl>
            <button
              type='button'
              disabled={server.players >= server.max}
              onClick={() =>
                notify(
                  t("servers.joining.title", { name: server.name }),
                  server.mods > 0
                    ? t("servers.joining.withMods")
                    : t("servers.joining.withoutMods"),
                )
              }
              className={cn(buttonVariants(), "mt-auto w-full")}>
              <GameControllerIcon />
              {server.players >= server.max
                ? t("servers.full")
                : t("servers.join")}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
};

const IMAGE_SCREENS = {
  foundry: "/home/screens/mod-foundry.webp",
  autoexec: "/home/screens/autoexec.webp",
  stats: "/home/screens/stats.webp",
} satisfies Partial<Record<ScreenId, string>>;

/** Screens shown as real captures of the app's content area. */
export const ImageScreen = ({
  screen,
}: {
  screen: keyof typeof IMAGE_SCREENS;
}) => {
  const { t } = useTranslation("preview");
  return (
    <img
      src={IMAGE_SCREENS[screen]}
      alt={t(`screens.${screen}Alt`)}
      width={1199}
      height={825}
      loading='lazy'
      className='block w-full'
    />
  );
};
