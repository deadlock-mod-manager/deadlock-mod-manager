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
