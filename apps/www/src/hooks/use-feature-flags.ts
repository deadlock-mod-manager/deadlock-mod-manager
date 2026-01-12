import type { FeatureFlag } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

export function useFeatureFlags() {
  return useQuery<FeatureFlag[]>({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      return await client.featureFlags.getFeatureFlags();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 3,
  });
}

export function useFeatureFlag(
  flagName: string,
  defaultValue: boolean = false,
) {
  const { data: featureFlags, ...rest } = useFeatureFlags();

  const flag = featureFlags?.find((flag) => flag.name === flagName);
  const isEnabled = flag?.enabled ?? defaultValue;

  return {
    ...rest,
    isEnabled,
    flag,
  };
}
