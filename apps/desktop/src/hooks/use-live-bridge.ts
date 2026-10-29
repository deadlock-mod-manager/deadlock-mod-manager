import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { useProgress } from "@/components/downloads/progress-indicator";
import { useInstallAction } from "@/hooks/use-install-action";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { LIVE_BRIDGE_LINK, ModCategory } from "@/lib/constants";
import { getModsStorePath } from "@/lib/download-cache";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { BridgeStatus } from "@/types/generated/BridgeStatus";
import { type LocalMod, ModStatus } from "@/types/mods";

const LIVE_BRIDGE_NAME = "Live Scoreboard Bridge";
const LIVE_BRIDGE_AUTHOR = "Okaza";
const LIVE_BRIDGE_FILE = "dmm-live-bridge.vpk";

const LIVE_BRIDGE_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c1426"/>
      <stop offset="1" stop-color="#0c0a10"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g fill="none" stroke="#f97316" stroke-linecap="round" stroke-width="22">
    <path d="M176 196a112 112 0 0 1 160 0"/>
    <path d="M126 146a182 182 0 0 1 260 0" opacity="0.6"/>
  </g>
  <circle cx="256" cy="246" r="26" fill="#f97316"/>
  <g fill="#f5f5f4">
    <rect x="136" y="312" width="64" height="104" rx="12" opacity="0.55"/>
    <rect x="224" y="288" width="64" height="128" rx="12"/>
    <rect x="312" y="336" width="64" height="80" rx="12" opacity="0.8"/>
  </g>
</svg>`;

// Shared by every caller, so the renderer's automatic update and the notice's
// button see one update in flight rather than starting a second.
const UPDATE_KEY = ["live-bridge-update"];
// Checking opens every addon's directory tree, so it is not repeated on every
// focus or mount.
const STATUS_STALE_MS = 5 * 60 * 1000;

const bridgeIn = (mods: LocalMod[]) =>
  mods.find((mod) => mod.remoteUrl === LIVE_BRIDGE_LINK);

const findBridge = () => bridgeIn(usePersistedStore.getState().localMods);

/**
 * The live bridge HUD mod that feeds the Live tab: whether it is in the
 * library, whether the game will load it, and installing or enabling it. The
 * backend builds it from the installed game, so it matches the current patch.
 */
export const useLiveBridge = () => {
  const { t } = useTranslation();
  const { setProcessing } = useProgress();
  const { processMod } = useModProcessor();
  const { performInstall } = useInstallAction();
  const queryClient = useQueryClient();
  const inLibrary = usePersistedStore((state) => !!bridgeIn(state.localMods));
  // The enabled bridge's file in the addons folder, as the library recorded
  // it. Enabling, disabling or deleting the bridge changes this, which re-runs
  // the cached check below.
  const installedVpk = usePersistedStore((state) => {
    const bridge = bridgeIn(state.localMods);
    return bridge?.status === ModStatus.Installed
      ? (bridge.installedVpks?.[0] ?? null)
      : null;
  });
  const profileFolder = usePersistedStore(
    (state) => state.getActiveProfile()?.folderName ?? null,
  );
  // Outdated means built from an older game or bridge.
  const status = useQuery({
    queryKey: ["live-bridge-status", profileFolder, installedVpk],
    queryFn: () =>
      invoke<BridgeStatus>("live_bridge_status", {
        profileFolder,
        installedVpk,
      }),
    staleTime: STATUS_STALE_MS,
    meta: { skipGlobalErrorHandler: true },
  });
  const refreshEnabled = () =>
    queryClient.invalidateQueries({ queryKey: ["live-bridge-status"] });

  // Adding a local mod only puts it in the library; enabling is the same step
  // My Mods runs, which copies it into the active profile.
  const enableInLibrary = async () => {
    const bridge = findBridge();
    if (!bridge) {
      throw new Error("The live bridge is not in the library");
    }
    await performInstall(bridge, "library");
  };

  const install = useMutation({
    mutationFn: async () => {
      if (!findBridge()) {
        await processMod(
          {
            name: LIVE_BRIDGE_NAME,
            author: LIVE_BRIDGE_AUTHOR,
            link: LIVE_BRIDGE_LINK,
            description: t("stats.live.bridge.modDescription"),
            imageFile: new File([LIVE_BRIDGE_LOGO], "live-bridge.svg", {
              type: "image/svg+xml",
            }),
          },
          ModCategory.HUD,
          { kind: "liveBridge", fileName: LIVE_BRIDGE_FILE },
        );
      }
      await enableInLibrary();
    },
    onSettled: refreshEnabled,
    onError: (error) => {
      // processMod leaves its progress indicator up when a step throws.
      setProcessing(false);
      logger.withError(error).error("Failed to install the live bridge");
      toast.error(t("stats.live.bridge.installFailed"));
    },
  });

  // Rebuilt into the library's copy, which then replaces the enabled one.
  const update = useMutation({
    mutationKey: UPDATE_KEY,
    mutationFn: async () => {
      const bridge = findBridge();
      if (!bridge || !installedVpk) {
        throw new Error("The live bridge is not enabled");
      }
      const libraryCopy = await join(
        await getModsStorePath(),
        bridge.id,
        "files",
        LIVE_BRIDGE_FILE,
      );
      await invoke("update_live_bridge", {
        profileFolder,
        libraryCopy,
        installedVpk,
      });
    },
    onSettled: refreshEnabled,
    onSuccess: () => toast.success(t("stats.live.bridge.updated")),
    onError: (error) => {
      logger.withError(error).error("Failed to update the live bridge");
      toast.error(t("stats.live.bridge.updateFailed"));
    },
  });

  return {
    inLibrary,
    // `null` until the bridge has been checked, so prompts never flash.
    status: status.data ?? null,
    isUpdating: useIsMutating({ mutationKey: UPDATE_KEY }) > 0,
    install,
    update,
  };
};
