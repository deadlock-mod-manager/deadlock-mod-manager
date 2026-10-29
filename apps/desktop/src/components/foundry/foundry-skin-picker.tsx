import { Button } from "@deadlock-mods/ui/components/button";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { FolderOpenIcon, HammerIcon, ImageIcon } from "@phosphor-icons/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsHeroAvailable } from "@/hooks/use-player-stats";
import {
  DEFAULT_FOUNDRY_SKINS,
  type DefaultFoundrySkin,
} from "@/lib/foundry-default-skins";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { usePersistedStore } from "@/lib/store";
import type { FoundryManifest } from "@/types/foundry";
import type { LocalMod } from "@/types/mods";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";

type PickerSource = "installed" | "heroes";

const heroOf = (mod: LocalMod): string | null =>
  mod.heroOverride ?? mod.detectedHero ?? null;

/** A hero skin has a resolved hero and is neither a map nor an audio mod. */
const isHeroSkin = (mod: LocalMod): boolean =>
  !mod.isMap && !mod.isAudio && Boolean(heroOf(mod));

const matches = (query: string, ...fields: (string | null | undefined)[]) =>
  !query ||
  fields.some((field) => field?.toLowerCase().includes(query) ?? false);

const SkinCard = ({
  mod,
  disabled,
  loading,
  onSelect,
}: {
  mod: LocalMod;
  disabled: boolean;
  loading: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  const coverImage = getModCoverImage(mod);
  const hero = heroOf(mod);
  return (
    <button
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary focus-visible:border-primary focus-visible:outline-none",
        loading && "border-primary",
        disabled && !loading && "pointer-events-none opacity-50",
      )}
      disabled={disabled}
      onClick={onSelect}
      type='button'>
      <div className='relative h-[150px] w-full overflow-hidden bg-muted'>
        {coverImage ? (
          <img
            alt={mod.name}
            className='h-full w-full object-cover'
            decoding='async'
            loading='lazy'
            src={coverImage}
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <ImageIcon
              className='h-8 w-8 text-muted-foreground'
              weight='duotone'
            />
          </div>
        )}
        {hero && (
          <span className='absolute top-2.5 left-2.5 rounded-[5px] bg-background/80 px-2 py-0.5 font-semibold text-[11px] backdrop-blur-sm'>
            {hero}
          </span>
        )}
        <div
          className={cn(
            "absolute inset-0 flex items-end bg-gradient-to-t from-background/90 via-background/0 to-transparent p-3 transition-opacity duration-200",
            loading
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}>
          {loading ? (
            <div className='w-full'>
              <FoundryLoadingBar />
            </div>
          ) : (
            <span className='flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs'>
              <HammerIcon className='h-3.5 w-3.5' weight='bold' />
              {t("foundry.picker.open")}
            </span>
          )}
        </div>
      </div>
      <div className='flex min-w-0 flex-col gap-0.5 px-3 py-2.5'>
        <span className='truncate font-semibold text-[13px]' title={mod.name}>
          {mod.name}
        </span>
        <span
          className='truncate text-[11px] text-muted-foreground'
          title={mod.author}>
          {t("foundry.picker.by", { author: mod.author })}
        </span>
      </div>
    </button>
  );
};

const HeroCard = ({
  skin,
  disabled,
  loading,
  onSelect,
}: {
  skin: DefaultFoundrySkin;
  disabled: boolean;
  loading: boolean;
  onSelect: () => void;
}) => (
  <button
    className={cn(
      "group relative aspect-[14/19] overflow-hidden rounded-lg border bg-gradient-to-b from-muted/70 to-card text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary focus-visible:border-primary focus-visible:outline-none",
      loading && "border-primary",
      disabled && !loading && "pointer-events-none opacity-50",
    )}
    disabled={disabled}
    onClick={onSelect}
    type='button'>
    <img
      alt={skin.hero}
      className='absolute inset-0 h-full w-full object-cover object-top'
      decoding='async'
      loading='lazy'
      src={skin.image}
    />
    <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent px-2.5 pt-8 pb-2.5'>
      {loading ? (
        <FoundryLoadingBar />
      ) : (
        <span className='block truncate font-semibold text-[13px]'>
          {skin.hero}
        </span>
      )}
    </div>
  </button>
);

const SourceToggle = ({
  value,
  counts,
  onChange,
}: {
  value: PickerSource;
  counts: Record<PickerSource, number>;
  onChange: (source: PickerSource) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("foundry.picker.sourceLabel")}
      className='flex shrink-0 gap-0.5 rounded-lg border bg-card p-[3px]'
      role='tablist'>
      {(["installed", "heroes"] as const).map((source) => {
        const active = source === value;
        return (
          <button
            aria-selected={active}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 font-medium text-[13px] transition-colors",
              active
                ? "bg-secondary font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            key={source}
            onClick={() => onChange(source)}
            role='tab'
            type='button'>
            {t(`foundry.picker.sources.${source}`)}
            <span
              className={cn(
                "font-mono text-[11px]",
                active ? "text-secondary-foreground" : "opacity-60",
              )}>
              {counts[source]}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Picks the skin the Foundry opens: one of the user's installed hero skins, a
 * base hero, or a VPK from disk. Used as the Foundry's start page and again in
 * the "Change skin" dialog.
 */
export const FoundrySkinPicker = ({
  onOpened,
  className,
}: {
  onOpened?: () => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const { importDefaultHero, importMod, importVpk, status } = useFoundry();
  const localMods = usePersistedStore((state) => state.localMods);
  const activeProfile = usePersistedStore(
    (state) => state.profiles[state.activeProfileId],
  );
  const isHeroAvailable = useIsHeroAvailable();
  const [query, setQuery] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const busy = status === "analyzing";

  const installedSkins = useMemo(
    () =>
      localMods.filter(isHeroSkin).sort((a, b) => a.name.localeCompare(b.name)),
    [localMods],
  );
  const heroSkins = useMemo(
    () => DEFAULT_FOUNDRY_SKINS.filter((skin) => isHeroAvailable(skin.hero)),
    [isHeroAvailable],
  );
  const [source, setSource] = useState<PickerSource>(
    installedSkins.length > 0 ? "installed" : "heroes",
  );

  const q = query.trim().toLowerCase();
  const visibleInstalled = useMemo(
    () =>
      installedSkins.filter((mod) =>
        matches(q, mod.name, mod.author, heroOf(mod)),
      ),
    [installedSkins, q],
  );
  const visibleHeroes = useMemo(
    () => heroSkins.filter((skin) => matches(q, skin.hero)),
    [heroSkins, q],
  );

  const open = useCallback(
    async (key: string, load: () => Promise<FoundryManifest | null>) => {
      setLoadingKey(key);
      try {
        if (await load()) onOpened?.();
      } finally {
        setLoadingKey(null);
      }
    },
    [onOpened],
  );

  const handleOpenFile = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: t("foundry.import.browseTitle"),
      filters: [{ name: "VPK", extensions: ["vpk"] }],
    });
    if (selected) {
      await open("file", () => importVpk(selected));
    }
  }, [importVpk, open, t]);

  const empty =
    source === "installed"
      ? installedSkins.length === 0
        ? t("foundry.import.noHeroSkins")
        : visibleInstalled.length === 0
          ? t("foundry.picker.noMatches")
          : null
      : visibleHeroes.length === 0
        ? t("foundry.import.noDefaultSkins")
        : null;

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className='flex shrink-0 items-center gap-2.5'>
        <SourceToggle
          counts={{
            installed: installedSkins.length,
            heroes: heroSkins.length,
          }}
          onChange={setSource}
          value={source}
        />
        <div className='min-w-0 flex-1'>
          <SearchInput
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("foundry.picker.search")}
            value={query}
          />
        </div>
        <Button
          className='shrink-0'
          disabled={busy}
          icon={<FolderOpenIcon className='h-4 w-4' />}
          onClick={handleOpenFile}
          variant='outline'>
          {loadingKey === "file"
            ? t("foundry.import.analyzing")
            : t("foundry.picker.openFile")}
        </Button>
      </div>

      {empty ? (
        <div className='flex min-h-0 flex-1 items-center justify-center'>
          <p className='max-w-sm text-center text-muted-foreground text-sm'>
            {empty}
          </p>
        </div>
      ) : (
        <ScrollArea className='min-h-0 flex-1'>
          {source === "installed" ? (
            <div className='grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 pr-3 pb-1'>
              {visibleInstalled.map((mod) => {
                const key = mod.remoteId ?? mod.id;
                return (
                  <SkinCard
                    disabled={busy}
                    key={key}
                    loading={loadingKey === key}
                    mod={mod}
                    onSelect={() =>
                      open(key, () =>
                        importMod(
                          key,
                          mod.installedVpks ?? [],
                          activeProfile?.folderName ?? null,
                          {
                            kind: "mod",
                            name: mod.name,
                            author: mod.author,
                            imageUrl: getModCoverImage(mod) ?? null,
                          },
                        ),
                      )
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className='grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 pr-3 pb-1'>
              {visibleHeroes.map((skin) => (
                <HeroCard
                  disabled={busy}
                  key={skin.hero}
                  loading={loadingKey === skin.hero}
                  onSelect={() =>
                    open(skin.hero, () =>
                      importDefaultHero(skin.hero, skin.image),
                    )
                  }
                  skin={skin}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
};
