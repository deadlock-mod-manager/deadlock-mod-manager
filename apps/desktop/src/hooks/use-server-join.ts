import type {
  ModDto,
  ResolvedRequirement,
  ServerBrowserEntry,
} from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { resolveServerMods } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

export interface ResolvedRequirementStatus extends Omit<
  ResolvedRequirement,
  "mod"
> {
  mod?: ModDto;
  inLibrary: boolean;
  isEnabled: boolean;
  status?: ModStatus;
  isDownloading: boolean;
}

export const useServerJoin = (server: ServerBrowserEntry | null) => {
  const localMods = usePersistedStore((s) => s.localMods);

  const hasRequirements = (server?.required_mods.length ?? 0) > 0;

  const query = useQuery({
    queryKey: ["servers", "resolve-mods", server?.id],
    queryFn: () => resolveServerMods(server!.id),
    enabled: !!server && hasRequirements,
    staleTime: 60 * 1000,
  });

  const requirements = useMemo<ResolvedRequirementStatus[]>(() => {
    const resolved = query.data?.resolved ?? [];
    return resolved.map((r): ResolvedRequirementStatus => {
      const remoteId = r.remoteId;
      const local = remoteId
        ? localMods.find((m) => m.remoteId === remoteId)
        : undefined;

      return {
        ...r,
        mod: r.mod as ModDto | undefined,
        inLibrary: !!local,
        isEnabled: local?.status === ModStatus.Installed,
        status: local?.status,
        isDownloading: local?.status === ModStatus.Downloading,
      };
    });
  }, [query.data, localMods]);

  const missing = requirements.filter((r) => r.resolved && !r.inLibrary);
  const disabled = requirements.filter((r) => r.resolved && !r.isEnabled);
  const unresolved = requirements.filter((r) => !r.resolved);
  const allReady =
    !hasRequirements ||
    (requirements.length > 0 && requirements.every((r) => r.isEnabled));

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    requirements,
    missing,
    disabled,
    unresolved,
    hasRequirements,
    allReady,
  };
};
