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

// The site sends the built filename, so it usually carries a .vpk suffix. That
// is right for the file on disk and wrong for the name shown in the library.
const toDisplayName = (name: string): string =>
  name.replace(VPK_SUFFIX, "").trim() || "DeadlockForge mod";

const toFileName = (name: string): string =>
  `${name.replace(VPK_SUFFIX, "")}.vpk`;

export const useForgeInstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { processMod } = useModProcessor();
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );

  // The listener is registered once, so it must read the current setting and
  // the current processMod rather than the ones captured when it was created.
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
          await invoke("finish_forge_install", { path: request.path }).catch(
            () => undefined,
          );
          return;
        }

        try {
          const accepted = !!(await confirm({
            title: t("forge.confirmTitle"),
            body: t("forge.confirmBody", { name: toDisplayName(request.name) }),
            actionButton: t("forge.confirmAction"),
            cancelButton: t("forge.confirmCancel"),
          }));

          if (!accepted) {
            logger.info("Forge install declined by user");
            return;
          }

          const bytes = await invoke<number[]>("read_dropped_mod_file", {
            filePath: request.path,
          });
          const file = new File(
            [new Uint8Array(bytes)],
            toFileName(request.name),
          );

          await processRef.current(
            {
              name: toDisplayName(request.name),
              author: request.author ?? FORGE_AUTHOR,
              link: FORGE_LINK,
              description: t("forge.modDescription"),
            },
            ModCategory.OTHER_MISC,
            { kind: "vpk", file },
          );
        } catch (error) {
          logger.withError(error).error("Failed to install mod from forge");
          toast.error(t("forge.installFailed"));
        } finally {
          await invoke("finish_forge_install", { path: request.path }).catch(
            () => undefined,
          );
        }
      },
    );

    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [confirm, t]);
};
