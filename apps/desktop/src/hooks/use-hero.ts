import { useQuery } from "@tanstack/react-query";
import { getHeroByName } from "@/lib/deadlock-api";

export const useHero = (name: string | null | undefined) =>
  useQuery({
    queryKey: ["deadlock-hero", name],
    queryFn: () => getHeroByName(name as string),
    enabled: !!name,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
