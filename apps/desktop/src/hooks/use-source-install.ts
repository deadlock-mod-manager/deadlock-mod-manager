import { toast } from "@deadlock-mods/ui/components/sonner";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
import { useConfirm } from "@/components/providers/alert-dialog";
import { ModCategory } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { formatSize } from "@/lib/utils";
import type { InstallLink } from "@/types/generated/InstallLink";
import type { SourceInstall } from "@/types/generated/SourceInstall";
import type { SourceInstallProgress } from "@/types/generated/SourceInstallProgress";
import { useModProcessor } from "./use-mod-processor";

const SOURCE_INSTALL_EVENT = "source-install-requested";

const cleanUpStagedDownload = async (path: string): Promise<void> => {
  try {
    await invoke("finish_source_install", { path });
  } catch (error) {
    logger.withError(error).warn("Failed to remove a staged source download");
  }
};

/**
 * Installs 1-click links from allowlisted mod sites. The mod is added as a
 * local mod that links back to its page on the site.
 */
export const useSourceInstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { setProcessing } = useProgress();
  const { processMod } = useModProcessor();

  // Registered once, so it must read current values rather than captured ones.
  const processRef = useRef(processMod);
  processRef.current = processMod;
  const setProcessingRef = useRef(setProcessing);
  setProcessingRef.current = setProcessing;

  // One link at a time: the confirm dialog and the progress toast each hold a
  // single request. Kept across effect runs so a remount cannot start a second
  // queue.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const installLink = async ({
      source,
      sourceName,
      modId,
      releaseId,
    }: InstallLink): Promise<void> => {
      const ids = { source, modId, releaseId };
      // Release-agnostic, so a newer release of an added mod is caught too.
      const installSource = `${source}/${modId}`;
      let stagedPath: string | null = null;

      try {
        const install = await invoke<SourceInstall>(
          "resolve_source_install",
          ids,
        );

        const alreadyAdded = usePersistedStore
          .getState()
          .localMods.some((mod) => mod.installSource === installSource);
        if (alreadyAdded) {
          toast.info(t("sourceInstall.alreadyAdded", { name: install.name }));
          return;
        }

        const accepted = !!(await confirm({
          title: t("sourceInstall.confirmTitle", {
            source: install.sourceName,
          }),
          body: t("sourceInstall.confirmBody", {
            source: install.sourceName,
            name: install.name,
            size: formatSize(install.size),
          }),
          actionButton: t("sourceInstall.confirmAction"),
          cancelButton: t("sourceInstall.confirmCancel"),
        }));

        if (!accepted) {
          logger
            .withMetadata({ feature: "source_install", outcome: "declined" })
            .info("Source install declined by user");
          return;
        }

        const status = t("sourceInstall.downloading", {
          name: install.name,
          source: install.sourceName,
        });
        setProcessingRef.current(true, status, {
          done: 0,
          total: install.size,
        });
        const onProgress = new Channel<SourceInstallProgress>(
          ({ downloaded, total }) =>
            setProcessingRef.current(true, status, {
              done: downloaded,
              total: total ?? install.size,
            }),
        );

        stagedPath = await invoke<string>("download_source_install", {
          ...ids,
          onProgress,
        });

        await processRef.current(
          {
            name: install.name,
            author: install.author ?? install.sourceName,
            link: install.pageUrl,
            description: t("sourceInstall.modDescription", {
              source: install.sourceName,
            }),
            imageUrl: install.imageUrl,
            installSource,
          },
          ModCategory.OTHER_MISC,
          { kind: "staged", path: stagedPath, fileName: install.fileName },
        );
      } catch (error) {
        logger
          .withMetadata({ source, modId, releaseId })
          .withError(error)
          .error("Failed to install mod from source");
        setProcessingRef.current(false);
        toast.error(t("sourceInstall.installFailed", { source: sourceName }), {
          description: getErrorMessage(error),
        });
      } finally {
        if (stagedPath) {
          await cleanUpStagedDownload(stagedPath);
        }
      }
    };

    // Rust holds the links, so one that started the app is not lost before
    // this listener exists.
    const drain = () => {
      queueRef.current = queueRef.current.then(async () => {
        try {
          const links = await invoke<InstallLink[]>(
            "take_pending_source_installs",
          );
          for (const link of links) {
            await installLink(link);
          }
        } catch (error) {
          logger
            .withError(error)
            .error("Failed to read pending source installs");
        }
      });
    };

    const unlisten = listen<null>(SOURCE_INSTALL_EVENT, drain);
    // Links already waiting are still installed if the listener fails.
    unlisten.then(drain, (error) => {
      logger.withError(error).error("Failed to listen for source installs");
      drain();
    });

    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, [confirm, t]);
};
