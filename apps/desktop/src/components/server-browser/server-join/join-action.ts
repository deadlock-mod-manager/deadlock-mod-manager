import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TFunction } from "i18next";
import logger from "@/lib/logger";

interface JoinServerArgs {
  server: ServerBrowserEntry;
  password: string;
  t: TFunction;
  onComplete: () => void;
}

export const buildSteamConnectUrl = (
  server: ServerBrowserEntry,
  password: string,
): string | null => {
  if (!server.connect_code) return null;
  const codeParam = server.connect_code.trim();
  if (!codeParam) return null;
  if (server.password_protected && password) {
    return `steam://connect/${codeParam}/${encodeURIComponent(password)}`;
  }
  return `steam://connect/${codeParam}`;
};

export const joinServer = async ({
  server,
  password,
  t,
  onComplete,
}: JoinServerArgs) => {
  if (server.gateway_url) {
    try {
      toast.info(t("servers.detail.openExternal"));
      await openUrl(server.gateway_url);
      onComplete();
    } catch (err) {
      logger.withError(err).error("Failed to open gateway URL");
    }
    return;
  }

  const steamUrl = buildSteamConnectUrl(server, password);
  if (steamUrl) {
    try {
      await openUrl(steamUrl);
      toast.success(t("servers.detail.connectCopied"));
      onComplete();
      return;
    } catch (err) {
      logger
        .withError(err)
        .warn("Failed to open steam:// URL, falling back to clipboard");
    }
  }

  if (server.connect_code) {
    const payload =
      server.password_protected && password
        ? `${server.connect_code} ${password}`
        : server.connect_code;
    try {
      await writeText(payload);
      toast.success(t("servers.detail.connectCopied"));
      onComplete();
    } catch (err) {
      logger.withError(err).error("Failed to copy connect code");
    }
  }
};
