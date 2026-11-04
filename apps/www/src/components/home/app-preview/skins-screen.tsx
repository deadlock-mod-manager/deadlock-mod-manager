import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { heroIcon, modById, modThumbnail } from "./mods";
import { EmptyState, PageTitle } from "./parts";
import { useInstalledMods, usePreviewState } from "./preview-state";
import { HEROES } from "./skin-heroes";
import { usePreviewNavigation } from "./store";

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
