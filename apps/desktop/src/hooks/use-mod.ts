import { useEffect } from "react";
import { useQuery } from "react-query";
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
  const upsertRemoteMod = usePersistedStore((state) => state.upsertRemoteMod);

  const query = useQuery({
    queryKey: ["mod", modId],
    queryFn: () => {
      if (!modId) {
        throw new Error("Mod ID is required");
      }
      return getMod(modId);
    },
    enabled: !!modId && !modId?.includes("local") && enabled,
    suspense: false,
    retry,
    useErrorBoundary: false,
  });

  useEffect(() => {
    if (query.data) {
      upsertRemoteMod(query.data);
    }
  }, [query.data, upsertRemoteMod]);

  return {
    ...query,
    mod: query.data,
  };
};
