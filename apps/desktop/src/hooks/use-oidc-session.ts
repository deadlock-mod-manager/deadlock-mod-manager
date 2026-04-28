import type { OIDCSession, OIDCUser } from "@deadlock-mods/shared/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetch } from "@/lib/fetch";
import { useCallback, useEffect, useState } from "react";
import { useAuthStatus } from "@/hooks/use-auth-status";
import {
  clearTokens,
  ensureValidToken,
  loadStoredTokens,
  onTokenChange,
} from "@/lib/auth/token";
import { AUTH_URL } from "@/lib/config";
import { HttpError } from "@/lib/http-error";

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
  const { isAuthOnline } = useAuthStatus();
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [tokensAvailable, setTokensAvailable] = useState(false);

  useEffect(() => {
    loadStoredTokens()
      .then((loaded) => {
        setTokensAvailable(loaded);
      })
      .catch(() => {
        setTokensAvailable(false);
      })
      .finally(() => {
        setTokensLoaded(true);
      });

    return onTokenChange((has) => {
      setTokensAvailable(has);
    });
  }, []);

  const sessionQuery = useQuery<OIDCSession | null>({
    queryKey: ["oidc-session"],
    queryFn: async () => {
      const token = await ensureValidToken();

      if (!token) {
        return null;
      }

      let response: Response;
      try {
        response = await fetch(`${AUTH_URL}/api/auth/oauth2/userinfo`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new HttpError("auth", 0, "/api/auth/oauth2/userinfo");
      }

      if (!response.ok) {
        if (response.status === 401) {
          await clearTokens();
          return null;
        }
        throw new HttpError(
          "auth",
          response.status,
          "/api/auth/oauth2/userinfo",
        );
      }

      const userInfo = (await response.json()) as OIDCUser;
      return { user: userInfo };
    },
    enabled: tokensLoaded && tokensAvailable && isAuthOnline,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnReconnect: false,
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
