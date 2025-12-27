import type { OIDCSession, OIDCUser } from "@deadlock-mods/shared/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useState } from "react";
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
  const [tokensLoaded, setTokensLoaded] = useState(false);

  useEffect(() => {
    loadStoredTokens()
      .catch(() => {})
      .finally(() => {
        setTokensLoaded(true);
      });
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
    enabled: tokensLoaded && hasTokens(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const signOut = useCallback(async () => {
    await clearTokens();
    queryClient.setQueryData(["oidc-session"], null);

    // In dev mode, open the auth server's logout page in system browser
    if (import.meta.env.DEV) {
      try {
        await open(`${AUTH_URL}/logout`);
      } catch {
        // Silently fail - the local tokens are already cleared
      }
    }
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
