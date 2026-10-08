import { usePerfCatalog } from "./use-perf-queries";

/**
 * The sections among `sections` that Valve's matchmaking error names as
 * unsupported gameinfo.gi changes, per the catalog's rules.
 */
export const useGuardedSections = (sections: string[]) => {
  const guarded = usePerfCatalog().data?.guardedSections ?? [];
  return sections.filter((section) =>
    guarded.some((name) => name.toLowerCase() === section.toLowerCase()),
  );
};
