import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { ModCategory } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { useModProcessor } from "./use-mod-processor";

const FORGE_INSTALL_EVENT = "forge-install-requested";
const FORGE_AUTHOR = "DeadlockForge";
const FORGE_LINK = "https://deadlockforge.net";

type ForgeInstallRequest = {
  name: string;
  path: string;
  author: string | null;
};

const VPK_SUFFIX = /\.vpk$/i;

// The site sends the built filename; the suffix suits the file, not the label.
const toDisplayName = (name: string, fallback: string): string =>
  name.replace(VPK_SUFFIX, "").trim() || fallback;

const finishInstall = async (path: string): Promise<void> => {
  try {
    await invoke("finish_forge_install", { path });
  } catch (error) {
    logger.withError(error).warn("Failed to release the forge install slot");
  }
};

const toFileName = (name: string): string =>
  `${name.replace(VPK_SUFFIX, "")}.vpk`;

export const useForgeInstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { processMod } = useModProcessor();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );

  // Registered once, so it must read current values rather than captured ones.
  const enabledRef = useRef(forgeInstallEnabled);
  enabledRef.current = forgeInstallEnabled;
  const processRef = useRef(processMod);
  processRef.current = processMod;

  useEffect(() => {
    const unlisten = listen<ForgeInstallRequest>(
      FORGE_INSTALL_EVENT,
      async (event) => {
        const request = event.payload;

        // The bridge only runs while the setting is on, but a request already
        // in flight when it is switched off must not slip through.
        if (!enabledRef.current) {
          await finishInstall(request.path);
          return;
        }

        try {
          const displayName = toDisplayName(
            request.name,
            t("forge.fallbackName"),
          );

          const accepted = !!(await confirm({
            title: t("forge.confirmTitle"),
            body: t("forge.confirmBody", { name: displayName }),
            actionButton: t("forge.confirmAction"),
            cancelButton: t("forge.confirmCancel"),
          }));

          if (!accepted) {
            logger
              .withMetadata({ feature: "forge", outcome: "declined" })
              .info("Forge install declined by user");
            return;
          }

          await processRef.current(
            {
              name: displayName,
              author: request.author ?? FORGE_AUTHOR,
              link: FORGE_LINK,
              description: t("forge.modDescription"),
            },
            ModCategory.OTHER_MISC,
            {
              kind: "vpkPath",
              path: request.path,
              fileName: toFileName(request.name),
            },
          );
        } catch (error) {
          logger.withError(error).error("Failed to install mod from forge");
          toast.error(t("forge.installFailed"));
        } finally {
          await finishInstall(request.path);
        }
      },
    );

    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [confirm, t]);
};
