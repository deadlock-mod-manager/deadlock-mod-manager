import type { OIDCSession, OIDCUser } from "@deadlock-mods/shared/auth";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getServerSession, logout } from "@/lib/auth/auth";

export type { OIDCSession, OIDCUser };

interface UseOIDCSessionResult {
  session: OIDCSession | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => void;
  refetch: () => Promise<void>;
}

export const sessionQueryOptions = queryOptions<OIDCSession | null>({
  queryKey: ["oidc-session"],
  queryFn: () => getServerSession(),
  staleTime: 5 * 60 * 1000,
  retry: false,
});

export function useOIDCSession(): UseOIDCSessionResult {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery(sessionQueryOptions);

  const signOut = useCallback(async () => {
    queryClient.setQueryData(sessionQueryOptions.queryKey, null);
    await logout();
  }, [queryClient]);

  return {
    session: sessionQuery.data ?? null,
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error as Error | null,
    signOut,
    refetch: async () => {
      await sessionQuery.refetch();
    },
  };
}
