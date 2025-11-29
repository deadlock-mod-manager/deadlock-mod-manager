import { useQuery } from "@tanstack/react-query";
import { getMod } from "@/lib/api";

interface UseModOptions {
  enabled?: boolean;
  retry?: number;
}

export const useMod = (
  modId: string | undefined,
  options: UseModOptions = {},
) => {
  const { enabled = true, retry = 1 } = options;

  const query = useQuery({
    queryKey: ["mod", modId],
    queryFn: () => {
      if (!modId) {
        throw new Error("Mod ID is required");
      }
      return getMod(modId);
    },
    enabled: !!modId && !modId?.includes("local") && enabled,
    retry,
    throwOnError: false,
  });

  return {
    ...query,
    mod: query.data,
  };
};
