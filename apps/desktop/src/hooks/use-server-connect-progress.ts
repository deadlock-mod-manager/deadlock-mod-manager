import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";

type ConnectProgress = {
  status:
    | "waiting-for-game"
    | "waiting-for-client"
    | "retrying"
    | "connected"
    | "timed-out"
    | "game-closed";
  address: string;
  attempt: number;
};

const TOAST_ID = "server-connect-progress";

/**
 * Surfaces what the Rust connect watchdog is doing. The join dialog closes as
 * soon as the game is launched, so this lives on the page instead.
 */
export const useServerConnectProgress = () => {
  const { t } = useTranslation();

  useEffect(() => {
    const unlisten = listen<ConnectProgress>(
      "server-connect-progress",
      ({ payload }) => {
        switch (payload.status) {
          // Both are silent by design: the join dialog is still up and already
          // showing its own progress while the game starts.
          case "waiting-for-game":
          case "waiting-for-client":
            return;
          case "retrying":
            toast.loading(
              t("servers.connect.retrying", { address: payload.address }),
              { id: TOAST_ID },
            );
            return;
          case "connected":
            toast.success(
              t("servers.connect.connected", { address: payload.address }),
              { id: TOAST_ID },
            );
            return;
          case "timed-out":
            toast.warning(
              t("servers.connect.timedOut", { address: payload.address }),
              { id: TOAST_ID, duration: 15_000 },
            );
            return;
          case "game-closed":
            toast.dismiss(TOAST_ID);
            return;
          default: {
            const exhaustive: never = payload.status;
            logger
              .withMetadata({ status: exhaustive })
              .warn("Unhandled server connect status");
          }
        }
      },
    );

    return () => {
      unlisten.then((off) => off());
    };
  }, [t]);
};
