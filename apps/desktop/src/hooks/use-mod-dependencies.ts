import type { ModDto } from "@deadlock-mods/shared";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getMod } from "@/lib/api-client";
import { modDetailQueryKey } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { ModDependency, ResolvedDependency } from "@/types/dependencies";

type DependencyWithRemoteId = ModDependency & { remoteId: string };

/**
 * Looks each dependency up in our mod catalogue. If we have the mod it's
 * internal and gets a proper card, otherwise it's external and just links out
 */
export const useResolvedDependencies = (
  dependencies: ModDependency[] | undefined,
): ResolvedDependency[] => {
  const deps = useMemo(() => dependencies ?? [], [dependencies]);
  const idDeps = useMemo(
    () => deps.filter((d): d is DependencyWithRemoteId => Boolean(d.remoteId)),
    [deps],
  );

  const results = useQueries({
    queries: idDeps.map((dependency) => ({
      queryKey: modDetailQueryKey(dependency.remoteId),
      queryFn: () => getMod(dependency.remoteId),
      staleTime: STALE_TIME_API,
      retry: false,
    })),
  });

  return useMemo(() => {
    // While we're still fetching a mod, leave its row out instead of briefly
    // showing it as a plain link. Only drop to a link once the fetch has finished
    // and found nothing
    const stateByRemoteId = new Map<
      string,
      { mod?: ModDto; pending: boolean }
    >();
    idDeps.forEach((dependency, index) => {
      const result = results[index];
      stateByRemoteId.set(dependency.remoteId, {
        mod: result?.data,
        pending: result?.status === "pending",
      });
    });

    const resolved: ResolvedDependency[] = [];
    for (const dependency of deps) {
      if (!dependency.remoteId) {
        // No id, so it's just a note or a link elsewhere
        resolved.push({ kind: "external", dependency });
        continue;
      }
      const state = stateByRemoteId.get(dependency.remoteId);
      if (state?.mod) {
        resolved.push({ kind: "internal", dependency, mod: state.mod });
      } else if (!state?.pending) {
        resolved.push({ kind: "external", dependency });
      }
    }
    return resolved;
  }, [deps, idDeps, results]);
};
