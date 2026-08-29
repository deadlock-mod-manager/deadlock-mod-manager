import { DeadlockHeroes } from "@deadlock-mods/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import PageTitle from "@/components/shared/page-title";
import { HeroList, type HeroListEntry } from "@/components/skins/hero-list";
import { SkinGrid } from "@/components/skins/skin-grid";
import { SkinPreviewPanel } from "@/components/skins/skin-preview-panel";
import { deriveActiveArchiveNames } from "@/hooks/use-mod-options";
import { useSkinSwap } from "@/hooks/use-skin-swap";
import useUninstall from "@/hooks/use-uninstall";
import { groupSkinsByHero } from "@/lib/mods/skin-selection";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

const Skins = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const localMods = usePersistedStore((state) => state.localMods);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const { selectSkin, swappingHero, installAction } = useSkinSwap();
  const { uninstall } = useUninstall();
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  // The skin the 3D panel shows, per hero, so coming back to a hero returns to
  // what was on screen. A null entry is a deliberate pick of the default skin.
  const [previewedByHero, setPreviewedByHero] = useState<
    Map<string, string | null>
  >(new Map());

  const groups = useMemo(() => groupSkinsByHero(localMods), [localMods]);

  const entries = useMemo<HeroListEntry[]>(() => {
    const knownHeroes: ReadonlySet<string> = new Set(
      Object.values(DeadlockHeroes),
    );
    // Manual overrides may name heroes outside the enum; keep them visible.
    const extraHeroes = [...groups.keys()]
      .filter((hero) => !knownHeroes.has(hero))
      .sort();
    const all = [...knownHeroes, ...extraHeroes].map((hero) => {
      const group = groups.get(hero);
      return {
        hero,
        skinCount: group?.skins.length ?? 0,
        activeNames: group?.active.map((mod) => mod.name) ?? [],
        conflicted:
          (group?.active.length ?? 0) > 1 ||
          (group?.active.some(
            (mod) => deriveActiveArchiveNames(mod).size > 1,
          ) ??
            false),
      };
    });
    return [
      ...all.filter((entry) => entry.skinCount > 0),
      ...all.filter((entry) => entry.skinCount === 0),
    ];
  }, [groups]);

  const effectiveHero =
    selectedHero ??
    entries.find((entry) => entry.skinCount > 0)?.hero ??
    entries[0]?.hero ??
    null;
  const selectedGroup = effectiveHero ? groups.get(effectiveHero) : undefined;

  // Without a pick of their own, the panel shows what the hero currently wears.
  const previewedId =
    effectiveHero && previewedByHero.has(effectiveHero)
      ? (previewedByHero.get(effectiveHero) ?? null)
      : (selectedGroup?.active[0]?.remoteId ?? null);
  const previewedMod =
    selectedGroup?.skins.find((skin) => skin.remoteId === previewedId) ?? null;

  const handlePreview = (mod: LocalMod | null) => {
    if (effectiveHero) {
      setPreviewedByHero((current) =>
        new Map(current).set(effectiveHero, mod?.remoteId ?? null),
      );
    }
  };

  const handleSelect = (mod: LocalMod | null) => {
    if (effectiveHero) {
      // Making a skin active is also a way of picking it, so the panel follows.
      handlePreview(mod);
      void selectSkin(effectiveHero, mod);
    }
  };

  const handleAddSkin = () => {
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
          <SkinGrid
            activeIds={
              new Set((selectedGroup?.active ?? []).map((mod) => mod.remoteId))
            }
            disabled={swappingHero !== null}
            hero={effectiveHero}
            onAddSkin={handleAddSkin}
            onDelete={handleDelete}
            onPreview={handlePreview}
            onSelect={handleSelect}
            previewedId={previewedId}
            skins={selectedGroup?.skins ?? []}
          />
        )}
        {effectiveHero && (
          <SkinPreviewPanel hero={effectiveHero} mod={previewedMod} />
        )}
      </div>
      <p className='shrink-0 py-3 text-muted-foreground text-xs'>
        {t("skins.overrideFooter")}{" "}
        <Link className='underline' to='/my-mods'>
          {t("skins.overrideFooterLink")}
        </Link>
      </p>

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
