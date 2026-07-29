import { DeadlockHeroes } from "@deadlock-mods/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import PageTitle from "@/components/shared/page-title";
import { HeroList, type HeroListEntry } from "@/components/skins/hero-list";
import { SkinGrid } from "@/components/skins/skin-grid";
import { useSkinSwap } from "@/hooks/use-skin-swap";
import { groupSkinsByHero } from "@/lib/mods/skin-selection";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

const Skins = () => {
  const { t } = useTranslation();
  const localMods = usePersistedStore((state) => state.localMods);
  const { selectSkin, swappingHero, installAction } = useSkinSwap();
  const [selectedHero, setSelectedHero] = useState<string | null>(null);

  const groups = useMemo(() => groupSkinsByHero(localMods), [localMods]);

  const entries = useMemo<HeroListEntry[]>(() => {
    const knownHeroes = Object.values(DeadlockHeroes) as string[];
    // Manual overrides may name heroes outside the enum; keep them visible.
    const extraHeroes = [...groups.keys()]
      .filter((hero) => !knownHeroes.includes(hero))
      .sort();
    const all = [...knownHeroes, ...extraHeroes].map((hero) => {
      const group = groups.get(hero);
      return {
        hero,
        skinCount: group?.skins.length ?? 0,
        activeNames: group?.active.map((mod) => mod.name) ?? [],
        conflicted: (group?.active.length ?? 0) > 1,
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

  const handleSelect = (mod: LocalMod | null) => {
    if (effectiveHero) {
      void selectSkin(effectiveHero, mod);
    }
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
            onSelect={handleSelect}
            skins={selectedGroup?.skins ?? []}
          />
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
