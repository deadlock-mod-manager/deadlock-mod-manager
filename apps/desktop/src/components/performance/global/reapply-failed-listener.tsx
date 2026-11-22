import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

const REAPPLY_FAILED_EVENT = "performance-config-reapply-failed";

/**
 * A launch puts the chosen config back into gameinfo.gi when an update or a
 * reset removed it. When that fails the game still starts, without the config.
 */
export const ReapplyFailedListener = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen<string>(REAPPLY_FAILED_EVENT, (event) => {
      toast.error(t("performance.reapplyFailed.title"), {
        description: event.payload,
        action: {
          label: t("performance.reapplyFailed.open"),
          onClick: () => navigate("/performance"),
        },
      });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t, navigate]);

  return null;
};
