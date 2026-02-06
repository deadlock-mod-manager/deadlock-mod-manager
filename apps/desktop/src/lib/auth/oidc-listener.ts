import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { queryClient } from "@/lib/client";
import logger from "@/lib/logger";
import { exchangeCodeForTokens } from "./oidc";
import { setTokens } from "./token";

interface OIDCCallbackPayload {
  code: string;
  state?: string;
}

interface OIDCErrorPayload {
  error: string;
  error_description?: string;
}

class OIDCListenerManager {
  private static instance: OIDCListenerManager;
  private initialized = false;
  private exchangeInProgress = false;

  private constructor() {}

  static getInstance(): OIDCListenerManager {
    if (!OIDCListenerManager.instance) {
      OIDCListenerManager.instance = new OIDCListenerManager();
    }
    return OIDCListenerManager.instance;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    logger.debug("Initializing OIDC event listeners");

    listen<OIDCCallbackPayload>("oidc-callback-received", (event) => {
      this.handleCodeExchange(event.payload.code);
    });

    listen<OIDCErrorPayload>("oidc-callback-error", (event) => {
      const { error, error_description } = event.payload;
      logger
        .withMetadata({ error_description })
        .withError(new Error(error))
        .error("OIDC callback error");
      toast.error(error_description || error || "Authentication failed");
    });
  }

  async handleCodeExchange(code: string) {
    if (this.exchangeInProgress) {
      logger.warn("Token exchange already in progress, skipping");
      return;
    }

    this.exchangeInProgress = true;
    try {
      const tokenResponse = await exchangeCodeForTokens(code);
      await setTokens(tokenResponse);
      queryClient.invalidateQueries({ queryKey: ["oidc-session"] });
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success("Successfully logged in!");
    } catch (error) {
      logger.withError(error).error("Failed to exchange code for tokens");
      toast.error("Failed to complete login");
    } finally {
      this.exchangeInProgress = false;
    }
  }
}

export const oidcListenerManager = OIDCListenerManager.getInstance();
oidcListenerManager.init();
