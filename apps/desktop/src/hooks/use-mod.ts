import { useQuery } from "@tanstack/react-query";
import { getMod } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";

interface UseModOptions {
  enabled?: boolean;
  retry?: number;
}

export const useMod = (
  modId: string | undefined,
  options: UseModOptions = {},
) => {
  const { enabled = true, retry = 1 } = options;
  const isLocal = modId?.includes("local") ?? false;
  const localMod = usePersistedStore((state) =>
    isLocal ? state.localMods.find((m) => m.remoteId === modId) : undefined,
  );

  const query = useQuery({
    queryKey: ["mod", modId],
    queryFn: () => {
      if (!modId) {
        throw new Error("Mod ID is required");
      }
      return getMod(modId);
    },
    enabled: !!modId && !isLocal && enabled,
    retry,
    throwOnError: false,
  });

  if (isLocal) {
    return {
      ...query,
      data: localMod,
      mod: localMod,
      isLoading: false,
      error: null,
    };
  }

  return {
    ...query,
    mod: query.data,
  };
};
