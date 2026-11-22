import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type DeadlockAbility,
  type DeadlockHero,
  getAbilities,
  getHeroes,
  getUpgrades,
} from "@/lib/deadlock-assets";
import { ABILITY_SLOTS, type Roll, rollLoadout } from "@/lib/randomizer/roll";

const ASSET_STALE_TIME = 60 * 60 * 1000;

export interface RandomizerState {
  roll: Roll | null;
  heroes: DeadlockHero[];
  abilities: (DeadlockAbility | undefined)[];
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

export const useRandomizer = (
  seed: number,
  heroSlug?: string,
): RandomizerState => {
  const heroesQuery = useQuery({
    queryKey: ["deadlock-assets", "heroes"],
    queryFn: getHeroes,
    staleTime: ASSET_STALE_TIME,
  });

  const upgradesQuery = useQuery({
    queryKey: ["deadlock-assets", "upgrades"],
    queryFn: getUpgrades,
    staleTime: ASSET_STALE_TIME,
  });

  const abilitiesQuery = useQuery({
    queryKey: ["deadlock-assets", "abilities"],
    queryFn: getAbilities,
    staleTime: ASSET_STALE_TIME,
  });

  const heroes = heroesQuery.data;
  const upgrades = upgradesQuery.data;
  const abilitiesByClassName = abilitiesQuery.data;

  const abilitiesFailed = abilitiesQuery.isError;
  const roll = useMemo(() => {
    if (!heroes?.length || !upgrades?.length) {
      return null;
    }
    if (!abilitiesByClassName && !abilitiesFailed) {
      return null;
    }
    return rollLoadout(seed, heroes, upgrades, {
      heroSlug,
      abilities: abilitiesByClassName,
    });
  }, [seed, heroSlug, heroes, upgrades, abilitiesByClassName, abilitiesFailed]);

  const abilities = useMemo(() => {
    if (!roll || !abilitiesByClassName) {
      return [];
    }
    return Array.from({ length: ABILITY_SLOTS }, (_, index) =>
      abilitiesByClassName.get(roll.hero.items[`signature${index + 1}`]),
    );
  }, [roll, abilitiesByClassName]);

  return {
    roll,
    heroes: heroes ?? [],
    abilities,
    isLoading:
      heroesQuery.isPending ||
      upgradesQuery.isPending ||
      abilitiesQuery.isPending,
    error: heroesQuery.error ?? upgradesQuery.error,
    retry: () => {
      void heroesQuery.refetch();
      void upgradesQuery.refetch();
      void abilitiesQuery.refetch();
    },
  };
};
