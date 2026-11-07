import { DeadlockHeroes } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import PageTitle from "@/components/shared/page-title";
import { AssignModDialog } from "@/components/skins/assign-mod-dialog";
import { HeroList } from "@/components/skins/hero-list";
import type { HeroListEntry } from "@/components/skins/hero-list-row";
import { HeroModGrid } from "@/components/skins/hero-mod-grid";
import { SkinPreviewPanel } from "@/components/skins/skin-preview-panel";
import type { SkinPreviewStatus } from "@/components/skins/skin-preview-status";
import { SkinPreviewSwitch } from "@/components/skins/skin-preview-switch";
import { SkinRandomizerSwitch } from "@/components/skins/skin-randomizer-switch";
import { useHeroSelection } from "@/hooks/use-hero-selection";
import { useIsHeroAvailable } from "@/hooks/use-player-stats";
import useUninstall from "@/hooks/use-uninstall";
import {
  groupModsByHero,
  type HeroModGroup,
  type HeroModKind,
} from "@/lib/mods/hero-mods";
import {
  canRandomizeMod,
  isRandomizedPool,
  randomizerPool,
} from "@/lib/mods/skin-randomizer";
import { filterHiddenNSFWItems } from "@/lib/mods/nsfw-visibility";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

const EMPTY_GROUP: HeroModGroup<LocalMod> = {
  skins: [],
  sounds: [],
  extras: [],
  activeSkins: [],
  activeSounds: [],
  activeExtras: [],
};

const Skins = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localMods = usePersistedStore((state) => state.localMods);
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  const visibleMods = useMemo(
    () => filterHiddenNSFWItems(localMods, hideNSFW) ?? [],
    [localMods, hideNSFW],
  );
  const hiddenHeroMods = usePersistedStore((state) => state.hiddenHeroMods);
  const heroExtrasEnabled = usePersistedStore(
    (state) => state.heroExtrasEnabled,
  );
  const multipleSkinsEnabled = usePersistedStore(
    (state) => state.multipleSkinsEnabled,
  );
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const previewEnabled = usePersistedStore(
    (state) => state.foundry3dPreviewEnabled,
  );
  const randomizerEnabled = usePersistedStore(
    (state) => state.skinRandomizerEnabled,
  );
  const randomizerSkins = usePersistedStore((state) => state.randomizerSkins);
  const randomizerDefaultHeroes = usePersistedStore(
    (state) => state.randomizerDefaultHeroes,
  );
  const setHeroOverride = usePersistedStore((state) => state.setHeroOverride);
  const restoreHeroMod = usePersistedStore((state) => state.restoreHeroMod);
  const { select, remove, busyHero, installAction } = useHeroSelection();
  const { uninstall } = useUninstall();
  const isHeroAvailable = useIsHeroAvailable();
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  // The skin the 3D panel shows, per hero, so coming back to a hero returns to
  // what was on screen. A null entry is a deliberate pick of the default skin.
  const [previewedByHero, setPreviewedByHero] = useState<
    Map<string, string | null>
  >(new Map());

  const hidden = useMemo(
    () => new Set(Object.keys(hiddenHeroMods)),
    [hiddenHeroMods],
  );

  const groups = useMemo(
    () =>
      groupModsByHero(visibleMods, {
        includeExtras: heroExtrasEnabled,
        hidden,
      }),
    [visibleMods, heroExtrasEnabled, hidden],
  );

  // Heroes the next modded launch will roll a skin for.
  const randomizedHeroes = useMemo(() => {
    const selection = {
      skins: randomizerSkins,
      defaultHeroes: randomizerDefaultHeroes,
    };
    return new Set(
      [...groups]
        .filter(([hero, group]) =>
          isRandomizedPool(randomizerPool(hero, group, selection)),
        )
        .map(([hero]) => hero),
    );
  }, [groups, randomizerSkins, randomizerDefaultHeroes]);

  const entries = useMemo<HeroListEntry[]>(() => {
    const knownHeroes: ReadonlySet<string> = new Set(
      Object.values(DeadlockHeroes),
    );
    // Manual overrides may name heroes outside the enum; keep them visible.
    const extraHeroes = [...groups.keys()]
      .filter((hero) => !knownHeroes.has(hero))
      .sort();
    // An unreleased hero still shows once the user has mods for it.
    const listedHeroes = [...knownHeroes].filter(
      (hero) => isHeroAvailable(hero) || groups.has(hero),
    );
    const all = [...listedHeroes, ...extraHeroes].map((hero) => {
      const group = groups.get(hero) ?? EMPTY_GROUP;
      // The rolled skin is a surprise for the game, not for this list.
      const randomized = randomizerEnabled && randomizedHeroes.has(hero);
      return {
        hero,
        modCount:
          group.skins.length + group.sounds.length + group.extras.length,
        wearing: randomized ? [] : group.activeSkins.map((mod) => mod.name),
        randomized,
        // Several skins at once is only a conflict while the user expects one.
        // Several archives of one mod are not: authors often split a skin
        // into a model download and a sounds download that belong together.
        conflicted:
          !randomized && !multipleSkinsEnabled && group.activeSkins.length > 1,
      };
    });
    return [
      ...all.filter((entry) => entry.modCount > 0),
      ...all.filter((entry) => entry.modCount === 0),
    ];
  }, [
    groups,
    isHeroAvailable,
    multipleSkinsEnabled,
    randomizerEnabled,
    randomizedHeroes,
  ]);

  const effectiveHero =
    selectedHero ??
    entries.find((entry) => entry.modCount > 0)?.hero ??
    entries[0]?.hero ??
    null;

  const selectedGroup = groups.get(effectiveHero ?? "") ?? EMPTY_GROUP;

  // Without a pick of their own, the panel shows what the hero currently wears,
  // unless the randomizer rolled it and it is meant to stay unseen.
  const hideWornSkin =
    randomizerEnabled && randomizedHeroes.has(effectiveHero ?? "");
  const previewedId =
    effectiveHero && previewedByHero.has(effectiveHero)
      ? (previewedByHero.get(effectiveHero) ?? null)
      : hideWornSkin
        ? null
        : (selectedGroup.activeSkins[0]?.remoteId ?? null);
  const previewedMod =
    selectedGroup.skins.find((skin) => skin.remoteId === previewedId) ?? null;
  const previewedInPool = previewedMod
    ? randomizerSkins[previewedMod.remoteId] === true &&
      canRandomizeMod(previewedMod)
    : randomizerDefaultHeroes[effectiveHero ?? ""] === true;
  const previewedWorn = previewedMod
    ? selectedGroup.activeSkins.some(
        (skin) => skin.remoteId === previewedMod.remoteId,
      )
    : selectedGroup.activeSkins.length === 0;
  const previewStatus: SkinPreviewStatus = hideWornSkin
    ? previewedInPool
      ? "inPool"
      : "notInPool"
    : previewedWorn
      ? "equipped"
      : "notEquipped";

  const handlePreview = (mod: LocalMod | null) => {
    if (effectiveHero) {
      setPreviewedByHero((current) =>
        new Map(current).set(effectiveHero, mod?.remoteId ?? null),
      );
    }
  };

  const handleSelect = (mod: LocalMod | null, kind: HeroModKind) => {
    if (effectiveHero) {
      if (kind === "skin") {
        handlePreview(mod);
      }
      void select(effectiveHero, mod, kind);
    }
  };

  const handleBrowseSkins = () => {
    if (!effectiveHero) {
      return;
    }
    // Hand the store a single-hero filter so the browser opens on exactly the
    // skins for the hero the user came from.
    updateModsFilters({
      selectedHeroes: [effectiveHero],
      filterMode: "include",
      searchQuery: "",
      showFavoritesOnly: false,
    });
    navigate("/mods");
  };

  const handleAssign = (mod: LocalMod) => {
    if (!effectiveHero) {
      return;
    }
    setHeroOverride(mod.remoteId, effectiveHero);
    restoreHeroMod(mod.remoteId);
    setAssigning(false);
    toast.success(
      t("skins.assignSuccess", { mod: mod.name, hero: effectiveHero }),
    );
  };

  const handleDelete = (mod: LocalMod) => {
    void uninstall(mod, true);
  };

  return (
    <div className='flex h-full w-full flex-col overflow-hidden pr-2 pb-4 pl-4'>
      <div className='mb-5 flex items-end justify-between gap-4'>
        <PageTitle subtitle={t("skins.subtitle")} title={t("skins.title")} />
        <div className='flex shrink-0 items-center gap-2'>
          <SkinPreviewSwitch />
          <SkinRandomizerSwitch
            groups={groups}
            randomizedHeroCount={randomizedHeroes.size}
          />
        </div>
      </div>
      <div className='flex min-h-0 flex-1 gap-5'>
        <HeroList
          entries={entries}
          onSelect={setSelectedHero}
          selectedHero={effectiveHero}
        />
        {effectiveHero && (
          <HeroModGrid
            disabled={busyHero !== null}
            group={selectedGroup}
            hero={effectiveHero}
            key={effectiveHero}
            onAssignMod={() => setAssigning(true)}
            onBrowseSkins={handleBrowseSkins}
            onDelete={handleDelete}
            onRemove={(mod) => void remove(effectiveHero, mod)}
            onSelect={handleSelect}
          />
        )}
        {effectiveHero && previewEnabled && (
          <SkinPreviewPanel
            hero={effectiveHero}
            mod={previewedMod}
            onWear={() => handleSelect(previewedMod, "skin")}
            status={previewStatus}
            wearDisabled={busyHero !== null}
          />
        )}
      </div>

      {effectiveHero && (
        <AssignModDialog
          hero={effectiveHero}
          hidden={hidden}
          mods={visibleMods}
          onAssign={handleAssign}
          onOpenChange={setAssigning}
          open={assigning}
        />
      )}

      <FileSelectorDialog
        fileTree={installAction.currentFileTree}
        isOpen={installAction.showFileSelector}
        modName={installAction.currentMod?.name}
        onCancel={installAction.cancelInstallation}
        onConfirm={installAction.confirmInstallation}
        onOpenChange={(open) => {
          if (!open) {
            installAction.cancelInstallation();
          }
        }}
      />
    </div>
  );
};

export default Skins;
