import { usePerfCatalog } from "./use-perf-queries";

export const useGuardedSections = (sections: string[]) => {
  const guarded = usePerfCatalog().data?.guardedSections ?? [];
  return sections.filter((section) =>
    guarded.some((name) => name.toLowerCase() === section.toLowerCase()),
  );
};
