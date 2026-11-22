import { ProviderError } from "@deadlock-mods/common/client-errors";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import { useConfirm } from "@/components/providers/alert-dialog";
import { AddModSourceDialog } from "@/components/settings/add-mod-source-dialog";
import { queueModDownload } from "@/hooks/use-download";
import useInstall from "@/hooks/use-install";
import type { ModEntryPoint } from "@/lib/analytics/schema";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import {
  listNativeSources,
  NATIVE_SOURCES_QUERY_KEY,
  nativeModDownloads,
  resolveNativeSourceLink,
  setNativeSourceEnabled,
  toNativeModDto,
} from "@/lib/mod-sources";
import {
  linkedComponentIds,
  nativeComponentDownloads,
} from "@/lib/mods/native-update-selection";
import {
  finishOneClickInstall,
  startOneClickInstall,
} from "@/lib/one-click-installs";
import { usePersistedStore } from "@/lib/store";
import type { NativeSourceLink } from "@/types/generated/NativeSourceLink";
import type { NativeSourceMod } from "@/types/generated/NativeSourceMod";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import { type ModDownloadItem, ModStatus } from "@/types/mods";

const LINK_EVENT = "native-source-link-requested";
const ENTRY_POINT: ModEntryPoint = "source_link";

type InstallLink = Extract<NativeSourceLink, { kind: "install" }>;

type AddRequest = {
  url: string;
  expectedSourceId?: string;
  reason?: string;
  resolve: (source: NativeSourceSummary | null) => void;
};

/**
 * Handles `sources/add` and `sources/install` links from a source's website.
 * Adding always goes through the reviewed add dialog; an install from a source
 * the user already added starts without asking, like a GameBanana 1-click.
 */
export const NativeSourceLinkHandler = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { install } = useInstall();
  const [adding, setAdding] = useState<AddRequest | null>(null);
  const [choosing, setChoosing] = useState<NativeSourceMod | null>(null);

  const askToAdd = (request: Omit<AddRequest, "resolve">) =>
    new Promise<NativeSourceSummary | null>((resolve) =>
      setAdding({ ...request, resolve }),
    );

  const installDownloaded = async (remoteId: string) => {
    const { localMods, setModStatus, setInstalledVpks } =
      usePersistedStore.getState();
    const localMod = localMods.find((mod) => mod.remoteId === remoteId);
    if (!localMod) {
      finishOneClickInstall(remoteId);
      return;
    }
    await install(localMod, {
      analyticsEntryPoint: ENTRY_POINT,
      onStart: (mod) => setModStatus(mod.remoteId, ModStatus.Installing),
      onComplete: (mod, result) => {
        setModStatus(mod.remoteId, ModStatus.Installed);
        setInstalledVpks(mod.remoteId, result.installed_vpks, result.file_tree);
        toast.success(t("mods.deepLinkInstalled", { name: mod.name }));
        finishOneClickInstall(remoteId);
      },
      onCancel: (mod) => {
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        finishOneClickInstall(remoteId);
      },
      onError: (mod, error) => {
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        toast.error(
          t("mods.deepLinkInstallError", {
            name: mod.name,
            message: error.message,
          }),
        );
        finishOneClickInstall(remoteId);
      },
    });
  };

  const downloadAndInstall = async (
    { source, listing, remoteId }: NativeSourceMod,
    selected: ModDownloadItem[],
    componentIds?: string[],
  ) => {
    const mod = toNativeModDto(source, listing, remoteId);
    toast.success(t("mods.deepLinkStarting"));
    await queueModDownload(
      componentIds ? { ...mod, source: { ...mod.source, componentIds } } : mod,
      selected,
      {
        allFiles: nativeModDownloads(source, listing),
        profileFolder:
          usePersistedStore.getState().getActiveProfile()?.folderName ?? null,
        analyticsEntryPoint: ENTRY_POINT,
        onComplete: () => void installDownloaded(remoteId),
        onError: (error) => {
          toast.error(
            t("downloads.downloadError", {
              name: mod.name,
              message: error.message,
            }),
          );
          finishOneClickInstall(remoteId);
        },
      },
    );
  };

  const installRecord = async (
    record: NativeSourceMod,
    artifactId: string | null,
  ) => {
    const { remoteId, listing } = record;
    if (!startOneClickInstall(remoteId, ENTRY_POINT)) return;
    navigate(`/mods/${remoteId}`);

    const inLibrary = usePersistedStore
      .getState()
      .localMods.some((mod) => mod.remoteId === remoteId);
    if (inLibrary) {
      toast.info(t("mods.deepLinkAlreadyInstalled", { name: listing.title }));
      finishOneClickInstall(remoteId);
      return;
    }

    const release = listing.release;
    const files = nativeModDownloads(record.source, listing);
    if (release?.installation.mode === "components") {
      const componentIds = linkedComponentIds(release.installation, artifactId);
      if (componentIds) {
        await downloadAndInstall(
          record,
          nativeComponentDownloads(release.installation, componentIds, files),
          componentIds,
        );
      } else {
        setChoosing(record);
      }
      return;
    }

    // Files list the release's artifacts in order, so they share an index.
    const linked = release?.artifacts.findIndex(({ id }) => id === artifactId);
    const selected =
      linked !== undefined && linked >= 0
        ? [files[linked]]
        : files.length === 1
          ? files
          : null;
    if (selected) {
      await downloadAndInstall(record, selected);
    } else {
      setChoosing(record);
    }
  };

  const resolveInstall = async (link: InstallLink) => {
    let target = await resolveNativeSourceLink(link);

    if (target.status === "notAdded") {
      const added = await askToAdd({
        url: link.descriptorUrl,
        expectedSourceId: link.sourceId,
        reason: t("modSources.linkAddReason"),
      });
      if (!added) return;
      target = await resolveNativeSourceLink(link);
    }

    if (target.status === "disabled") {
      const { sourceKey } = target;
      const name =
        (await listNativeSources()).find((source) => source.key === sourceKey)
          ?.descriptor.name ?? link.sourceId;
      const accepted = await confirm({
        title: t("modSources.linkEnableTitle", { name }),
        body: t("modSources.linkEnableBody", { name }),
        actionButton: t("modSources.enableAction"),
      });
      if (!accepted) return;
      await setNativeSourceEnabled(sourceKey, true);
      await queryClient.invalidateQueries({
        queryKey: NATIVE_SOURCES_QUERY_KEY,
      });
      target = await resolveNativeSourceLink(link);
    }

    if (target.status !== "ready") {
      throw new ProviderError("The linked source could not be found");
    }
    try {
      await installRecord(target.record, link.artifactId);
    } catch (error) {
      finishOneClickInstall(target.record.remoteId);
      throw error;
    }
  };

  const handleLink = async (link: NativeSourceLink) => {
    try {
      if (link.kind === "install") {
        await resolveInstall(link);
        return;
      }
      const added = await askToAdd({ url: link.descriptorUrl });
      if (added) navigate(`/mods?source=${added.key}`);
    } catch (error) {
      logger
        .withMetadata({ feature: "source_link", kind: link.kind })
        .withError(error)
        .error("Failed to handle mod source link");
      toast.error(t("modSources.linkFailed"), {
        description: getErrorMessage(error),
      });
    }
  };

  // Registered once, so it must read current values rather than captured ones.
  const handleRef = useRef(handleLink);
  handleRef.current = handleLink;

  // One link at a time: the add dialog holds a single request.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Rust holds the links, so one that started the app is not lost before
    // this listener exists.
    const drain = () => {
      queueRef.current = queueRef.current.then(async () => {
        try {
          const links = await invoke<NativeSourceLink[]>(
            "take_pending_native_source_links",
          );
          for (const link of links) {
            await handleRef.current(link);
          }
        } catch (error) {
          logger
            .withError(error)
            .error("Failed to read pending mod source links");
        }
      });
    };

    const unlisten = listen<null>(LINK_EVENT, drain);
    unlisten.then(drain, (error) => {
      logger.withError(error).error("Failed to listen for mod source links");
      drain();
    });

    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, []);

  const closeChoice = () => {
    if (choosing) finishOneClickInstall(choosing.remoteId);
    setChoosing(null);
  };
  const release = choosing?.listing.release;
  const choiceFiles = choosing
    ? nativeModDownloads(choosing.source, choosing.listing)
    : [];

  return (
    <>
      {adding && (
        <AddModSourceDialog
          expectedSourceId={adding.expectedSourceId}
          initialUrl={adding.url}
          key={adding.url}
          onAdded={adding.resolve}
          onOpenChange={(open) => {
            if (open) return;
            adding.resolve(null);
            setAdding(null);
          }}
          open
          reason={adding.reason}
        />
      )}
      {choosing &&
        (release?.installation.mode === "components" ? (
          <MultiFileDownloadDialog
            components={{
              installation: release.installation,
              onConfirm: async (componentIds) => {
                await downloadAndInstall(
                  choosing,
                  nativeComponentDownloads(
                    release.installation,
                    componentIds,
                    choiceFiles,
                  ),
                  componentIds,
                );
                setChoosing(null);
              },
            }}
            files={choiceFiles}
            isOpen
            modName={choosing.listing.title}
            onClose={closeChoice}
          />
        ) : (
          <MultiFileDownloadDialog
            files={choiceFiles}
            isOpen
            modName={choosing.listing.title}
            onClose={closeChoice}
            onDownload={(selected) => {
              setChoosing(null);
              void downloadAndInstall(choosing, selected);
            }}
          />
        ))}
    </>
  );
};
