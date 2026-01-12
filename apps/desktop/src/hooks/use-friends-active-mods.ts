import type { FriendsActiveModsDto } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { getFriendsActiveMods } from "@/lib/api";
import { useAuth } from "./use-auth";
import { useFeatureFlag } from "./use-feature-flags";

export const useFriendsActiveMods = () => {
  const { isAuthenticated } = useAuth();
  const { isEnabled: isFriendSystemEnabled } = useFeatureFlag("friend-system");

  return useQuery<FriendsActiveModsDto>({
    queryKey: ["friends-active-mods"],
    queryFn: getFriendsActiveMods,
    enabled: isAuthenticated && isFriendSystemEnabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useFriendsUsingMod = (modId: string | undefined) => {
  const { data: friendsActiveMods, isLoading } = useFriendsActiveMods();

  if (!modId || !friendsActiveMods) {
    return { friends: [], isLoading };
  }

  const friends = friendsActiveMods[modId] ?? [];
  return { friends, isLoading };
};
