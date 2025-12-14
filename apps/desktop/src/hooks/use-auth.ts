import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect } from "react";
import { exchangeCodeForTokens } from "@/lib/auth/oidc";
import { clearTokens, setTokens } from "@/lib/auth/token";
import logger from "@/lib/logger";
import { useOIDCSession } from "./use-oidc-session";

interface OIDCCallbackPayload {
  code: string;
  state?: string;
}

interface OIDCErrorPayload {
  error: string;
  error_description?: string;
}

export const useAuth = () => {
  const queryClient = useQueryClient();
  const {
    session,
    isLoading,
    refetch,
    signOut: oidcSignOut,
  } = useOIDCSession();

  const handleOIDCCallback = useCallback(
    async (payload: OIDCCallbackPayload) => {
      try {
        const tokenResponse = await exchangeCodeForTokens(payload.code);
        await setTokens(tokenResponse);
        queryClient.invalidateQueries({ queryKey: ["oidc-session"] });
        queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
        toast.success("Successfully logged in!");
      } catch (error) {
        logger.error("Failed to exchange code for tokens", error);
        toast.error("Failed to complete login");
      }
    },
    [queryClient],
  );

  useEffect(() => {
    const setupAuthCallbackListeners = async () => {
      const unlistenOIDCSuccess = await listen<OIDCCallbackPayload>(
        "oidc-callback-received",
        async (event) => {
          await handleOIDCCallback(event.payload);
        },
      );

      const unlistenOIDCError = await listen<OIDCErrorPayload>(
        "oidc-callback-error",
        async (event) => {
          const { error, error_description } = event.payload;
          logger.error("OIDC callback error", { error, error_description });
          toast.error(error_description || error || "Authentication failed");
        },
      );

      return () => {
        unlistenOIDCSuccess();
        unlistenOIDCError();
      };
    };

    const unlistenPromise = setupAuthCallbackListeners();

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [handleOIDCCallback]);

  const logout = useCallback(async () => {
    try {
      await clearTokens();
      await oidcSignOut();
      queryClient.invalidateQueries({ queryKey: ["oidc-session"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success("Logged out successfully");
    } catch (error) {
      logger.error("Failed to logout", error);
      toast.error("Failed to logout");
    }
  }, [oidcSignOut, queryClient]);

  return {
    user: session?.user ?? null,
    session: session ?? null,
    isAuthenticated: !!session?.user,
    isLoading,
    logout,
    refetch,
  };
};
