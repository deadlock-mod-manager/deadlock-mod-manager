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

/** Assets change once per patch, so a session never needs to refetch them. */
const ASSET_STALE_TIME = 60 * 60 * 1000;

export interface RandomizerState {
  roll: Roll | null;
  /** Every hero a roll can land on, for the hero picker. */
  heroes: DeadlockHero[];
  /** Signature abilities in `signature1`..`signature4` order. */
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

  // The abilities decide which heroes can use the charge items, so the roll
  // waits for them rather than rolling once without and again with them. If
  // they fail to load, it rolls without them instead of not rolling at all.
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
    // Abilities are optional to a roll, so their failure is not surfaced here.
    error: heroesQuery.error ?? upgradesQuery.error,
    retry: () => {
      void heroesQuery.refetch();
      void upgradesQuery.refetch();
      void abilitiesQuery.refetch();
    },
  };
};
