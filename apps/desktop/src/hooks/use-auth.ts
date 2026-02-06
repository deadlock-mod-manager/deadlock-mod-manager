import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { clearTokens } from "@/lib/auth/token";
import logger from "@/lib/logger";
import { useOIDCSession } from "./use-oidc-session";

export { oidcListenerManager } from "@/lib/auth/oidc-listener";

export const useAuth = () => {
  const queryClient = useQueryClient();
  const {
    session,
    isLoading,
    refetch,
    signOut: oidcSignOut,
  } = useOIDCSession();

  const logout = useCallback(async () => {
    try {
      await clearTokens();
      await oidcSignOut();
      queryClient.invalidateQueries({ queryKey: ["oidc-session"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success("Logged out successfully");
    } catch (error) {
      logger.withError(error).error("Failed to logout");
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
