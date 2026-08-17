import { DeadlockHeroes } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import PageTitle from "@/components/shared/page-title";
import { AssignModDialog } from "@/components/skins/assign-mod-dialog";
import { HeroList, type HeroListEntry } from "@/components/skins/hero-list";
import { HeroModGrid } from "@/components/skins/hero-mod-grid";
import { useHeroSelection } from "@/hooks/use-hero-selection";
import { deriveActiveArchiveNames } from "@/hooks/use-mod-options";
import useUninstall from "@/hooks/use-uninstall";
import { groupModsByHero, type HeroModGroup } from "@/lib/mods/hero-mods";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

const EMPTY_GROUP: HeroModGroup<LocalMod> = {
  skins: [],
  extras: [],
  activeSkins: [],
  activeExtras: [],
};

const Skins = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localMods = usePersistedStore((state) => state.localMods);
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
  const setHeroOverride = usePersistedStore((state) => state.setHeroOverride);
  const restoreHeroMod = usePersistedStore((state) => state.restoreHeroMod);
  const { select, remove, busyHero, installAction } = useHeroSelection();
  const { uninstall } = useUninstall();
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const hidden = useMemo(
    () => new Set(Object.keys(hiddenHeroMods)),
    [hiddenHeroMods],
  );

  const groups = useMemo(
    () =>
      groupModsByHero(localMods, {
        includeExtras: heroExtrasEnabled,
        hidden,
      }),
    [localMods, heroExtrasEnabled, hidden],
  );

  const entries = useMemo<HeroListEntry[]>(() => {
    const knownHeroes: ReadonlySet<string> = new Set(
      Object.values(DeadlockHeroes),
    );
    // Manual overrides may name heroes outside the enum; keep them visible.
    const extraHeroes = [...groups.keys()]
      .filter((hero) => !knownHeroes.has(hero))
      .sort();
    const all = [...knownHeroes, ...extraHeroes].map((hero) => {
      const group = groups.get(hero) ?? EMPTY_GROUP;
      return {
        hero,
        modCount: group.skins.length + group.extras.length,
        activeNames: [...group.activeSkins, ...group.activeExtras].map(
          (mod) => mod.name,
        ),
        // Several skins at once is only a conflict while the user expects one.
        conflicted:
          !multipleSkinsEnabled &&
          (group.activeSkins.length > 1 ||
            group.activeSkins.some(
              (mod) => deriveActiveArchiveNames(mod).size > 1,
            )),
      };
    });
    return [
      ...all.filter((entry) => entry.modCount > 0),
      ...all.filter((entry) => entry.modCount === 0),
    ];
  }, [groups, multipleSkinsEnabled]);

  const effectiveHero =
    selectedHero ??
    entries.find((entry) => entry.modCount > 0)?.hero ??
    entries[0]?.hero ??
    null;

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
    <div className='flex h-full w-full flex-col overflow-hidden pl-4 pr-2'>
      <div className='mb-6'>
        <PageTitle subtitle={t("skins.subtitle")} title={t("skins.title")} />
      </div>
      <div className='flex min-h-0 flex-1 gap-4'>
        <HeroList
          entries={entries}
          onSelect={setSelectedHero}
          selectedHero={effectiveHero}
        />
        {effectiveHero && (
          <HeroModGrid
            disabled={busyHero !== null}
            group={groups.get(effectiveHero) ?? EMPTY_GROUP}
            hero={effectiveHero}
            onAssignMod={() => setAssigning(true)}
            onBrowseSkins={handleBrowseSkins}
            onDelete={handleDelete}
            onRemove={(mod) => void remove(effectiveHero, mod)}
            onSelect={(mod, kind) => void select(effectiveHero, mod, kind)}
          />
        )}
      </div>
      <p className='shrink-0 py-3 text-muted-foreground text-xs'>
        {t("skins.overrideFooter")}{" "}
        <Link className='underline' to='/my-mods'>
          {t("skins.overrideFooterLink")}
        </Link>
      </p>

      {effectiveHero && (
        <AssignModDialog
          hero={effectiveHero}
          hidden={hidden}
          mods={localMods}
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
