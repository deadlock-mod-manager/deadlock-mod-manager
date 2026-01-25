import type { FriendListDto } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { getFriends } from "@/lib/api";
import { useAuth } from "./use-auth";
import { useFeatureFlag } from "./use-feature-flags";

interface UseFriendsResult {
  friends: FriendListDto | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFriends(): UseFriendsResult {
  const { isAuthenticated } = useAuth();
  const { isEnabled: isFriendSystemEnabled } = useFeatureFlag("friend-system");

  const friendsQuery = useQuery<FriendListDto>({
    queryKey: ["friends"],
    queryFn: getFriends,
    enabled: isAuthenticated && isFriendSystemEnabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return {
    friends: friendsQuery.data ?? null,
    isLoading: friendsQuery.isLoading,
    error: friendsQuery.error as Error | null,
    refetch: async () => {
      await friendsQuery.refetch();
    },
  };
}
