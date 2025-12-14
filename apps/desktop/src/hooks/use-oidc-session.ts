import type { OIDCSession, OIDCUser } from "@deadlock-mods/shared/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { useCallback, useEffect } from "react";
import {
  clearTokens,
  ensureValidToken,
  hasTokens,
  loadStoredTokens,
} from "@/lib/auth/token";
import { AUTH_URL } from "@/lib/config";

export type { OIDCSession, OIDCUser };

interface UseOIDCSessionResult {
  session: OIDCSession | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useOIDCSession(): UseOIDCSessionResult {
  const queryClient = useQueryClient();

  useEffect(() => {
    void loadStoredTokens();
  }, []);

  const sessionQuery = useQuery<OIDCSession | null>({
    queryKey: ["oidc-session"],
    queryFn: async () => {
      const token = await ensureValidToken();

      if (!token) {
        return null;
      }

      const response = await fetch(`${AUTH_URL}/api/auth/oauth2/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          await clearTokens();
          return null;
        }
        throw new Error("Failed to fetch user info");
      }

      const userInfo = (await response.json()) as OIDCUser;
      return { user: userInfo };
    },
    enabled: hasTokens(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const signOut = useCallback(async () => {
    await clearTokens();
    queryClient.setQueryData(["oidc-session"], null);
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
