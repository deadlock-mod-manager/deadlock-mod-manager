import type { OIDCSession, OIDCUser } from "@deadlock-mods/shared/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { getServerSession, logout } from "@/lib/auth/auth.server";
import { setAccessToken } from "@/utils/orpc";

export type { OIDCSession, OIDCUser };

interface UseOIDCSessionResult {
  session: OIDCSession | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => void;
  refetch: () => Promise<void>;
}

export function useOIDCSession(): UseOIDCSessionResult {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<OIDCSession | null>({
    queryKey: ["oidc-session"],
    queryFn: async () => {
      const session = await getServerSession();
      if (session?.accessToken) {
        setAccessToken(session.accessToken);
      } else {
        setAccessToken(null);
      }
      return session;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.data?.accessToken) {
      setAccessToken(sessionQuery.data.accessToken);
    } else if (!sessionQuery.isLoading) {
      setAccessToken(null);
    }
  }, [sessionQuery.data?.accessToken, sessionQuery.isLoading]);

  const signOut = useCallback(async () => {
    setAccessToken(null);
    queryClient.setQueryData(["oidc-session"], null);
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
