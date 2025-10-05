import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-shell";
import { useEffect } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { Session, User } from "@/lib/store/slices/auth";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:9000";
const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3001";

export const useAuth = () => {
  const {
    user,
    session,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth,
    setLoading,
  } = usePersistedStore();

  useEffect(() => {
    const validateAndSetSessionInternal = async (token: string) => {
      try {
        logger.info(
          "Validating token at:",
          `${BASE_URL}/auth/desktop/validate`,
        );
        const response = await fetch(`${BASE_URL}/auth/desktop/validate`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        logger.info("Validation response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          logger.error("Validation failed with response:", errorText);
          throw new Error("Failed to validate session");
        }

        const data = (await response.json()) as {
          user: User;
          session: Omit<Session, "token">;
        };

        logger.info("Session validated for user:", data.user.email);
        setAuth(data.user, { ...data.session, token });
      } catch (error) {
        logger.error("Failed to validate session", error);
        await invoke("clear_auth_token");
        clearAuth();
        throw error;
      }
    };

    const initializeAuth = async () => {
      try {
        setLoading(true);
        const token = await invoke<string | null>("get_auth_token");

        if (token) {
          await validateAndSetSessionInternal(token);
        } else {
          setLoading(false);
        }
      } catch (error) {
        logger.error("Failed to initialize auth", error);
        setLoading(false);
      }
    };

    initializeAuth();

    const setupAuthCallbackListener = async () => {
      const unlisten = await listen<string>(
        "auth-callback-received",
        async (event) => {
          const token = event.payload;

          try {
            await invoke("store_auth_token", { token });
            await validateAndSetSessionInternal(token);
            toast.success("Successfully logged in!");
          } catch (error) {
            logger.error("Failed to process auth callback", error);
            toast.error("Failed to complete login");
          }
        },
      );

      return unlisten;
    };

    const unlistenPromise = setupAuthCallbackListener();

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setAuth, clearAuth, setLoading]);

  const login = async () => {
    try {
      const loginUrl = `${WEB_URL}/login?desktop=true`;
      await open(loginUrl);
    } catch (error) {
      logger.error("Failed to open login page", error);
      toast.error("Failed to open login page");
    }
  };

  const logout = async () => {
    try {
      if (session?.token) {
        await fetch(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });
      }
    } catch (error) {
      logger.error("Failed to sign out from server", error);
    } finally {
      await invoke("clear_auth_token");
      clearAuth();
      toast.success("Logged out successfully");
    }
  };

  return {
    user,
    session,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
};
