import { Badge } from "@deadlock-mods/ui/components/badge";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowsClockwiseIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { modThumbnail } from "./mods";
import { EmptyState, isRecentlyUpdated } from "./parts";
import { useInstalledMods, usePreviewState } from "./preview-state";
import { usePreviewNavigation } from "./store";

export type LibraryTab = "all" | "installed" | "downloaded";

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
