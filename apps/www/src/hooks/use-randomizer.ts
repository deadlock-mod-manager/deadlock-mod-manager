import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type DeadlockAbility,
  getAbilities,
  getHeroes,
  getUpgrades,
} from "@/lib/deadlock-assets";
import { ABILITY_SLOTS, type Roll, rollLoadout } from "@/lib/randomizer/roll";

/** Assets change once per patch, so a session never needs to refetch them. */
const ASSET_STALE_TIME = 60 * 60 * 1000;

export interface RandomizerState {
  roll: Roll | null;
  /** Signature abilities in `signature1`..`signature4` order. */
  abilities: (DeadlockAbility | undefined)[];
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

export const useRandomizer = (seed: number): RandomizerState => {
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

  // Loaded once for the whole roster rather than per hero, so a reroll never
  // waits on the network to show its ability icons.
  const abilitiesQuery = useQuery({
    queryKey: ["deadlock-assets", "abilities"],
    queryFn: getAbilities,
    staleTime: ASSET_STALE_TIME,
  });

  const heroes = heroesQuery.data;
  const upgrades = upgradesQuery.data;
  const abilitiesByClassName = abilitiesQuery.data;

  const roll = useMemo(() => {
    if (!heroes?.length || !upgrades?.length) {
      return null;
    }
    return rollLoadout(seed, heroes, upgrades);
  }, [seed, heroes, upgrades]);

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
    abilities,
    isLoading:
      heroesQuery.isPending ||
      upgradesQuery.isPending ||
      abilitiesQuery.isPending,
    error: heroesQuery.error ?? upgradesQuery.error ?? abilitiesQuery.error,
    retry: () => {
      void heroesQuery.refetch();
      void upgradesQuery.refetch();
      void abilitiesQuery.refetch();
    },
  };
};
