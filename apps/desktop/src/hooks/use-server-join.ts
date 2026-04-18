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
  isReady: boolean;
  isEnabled: boolean;
  status?: ModStatus;
  isDownloading: boolean;
}

export const useServerJoin = (server: ServerBrowserEntry | null) => {
  const localMods = usePersistedStore((s) => s.localMods);
  const profiles = usePersistedStore((s) => s.profiles);
  const activeProfileId = usePersistedStore((s) => s.activeProfileId);
  const isModEnabledInCurrentProfile = usePersistedStore(
    (s) => s.isModEnabledInCurrentProfile,
  );

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
      const inLibrary = !!local;
      const status = local?.status;
      const isInstalledOrDownloaded =
        !!local &&
        (status === ModStatus.Installed || status === ModStatus.Downloaded);
      const isEnabled = remoteId
        ? isModEnabledInCurrentProfile(remoteId)
        : false;
      const isReady = isInstalledOrDownloaded && isEnabled;
      const isDownloading = status === ModStatus.Downloading;
      return {
        ...r,
        mod: r.mod as ModDto | undefined,
        inLibrary,
        isReady,
        isEnabled,
        status,
        isDownloading,
      };
    });
  }, [
    query.data,
    localMods,
    profiles,
    activeProfileId,
    isModEnabledInCurrentProfile,
  ]);

  const missing = requirements.filter(
    (r) =>
      r.resolved &&
      !r.isReady &&
      !(
        r.inLibrary &&
        (r.status === ModStatus.Installed || r.status === ModStatus.Downloaded)
      ),
  );
  const disabled = requirements.filter(
    (r) =>
      r.resolved &&
      r.inLibrary &&
      (r.status === ModStatus.Installed || r.status === ModStatus.Downloaded) &&
      !r.isEnabled,
  );
  const unresolved = requirements.filter((r) => !r.resolved);
  const allReady =
    !hasRequirements ||
    (requirements.length > 0 && requirements.every((r) => r.isReady));

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
