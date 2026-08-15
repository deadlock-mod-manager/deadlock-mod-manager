import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import {
  type JoinOutcome,
  joinServer,
} from "@/components/server-browser/server-join/join-action";
import type { ResolvedRequirementStatus } from "@/hooks/use-server-join";
import type { useServerStage } from "@/hooks/use-server-stage";
import { getErrorMessage } from "@/lib/errors";
import { restoreProfileGameinfo } from "@/lib/gameinfo";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";
import { getAdditionalArgs } from "@/lib/utils";

const GAME_EXIT_POLL_MS = 500;
const GAME_EXIT_TIMEOUT_MS = 20_000;

/** The user declined the restart the join needed, so nothing happened. */
type JoinResult = JoinOutcome | { kind: "cancelled" };

interface JoinVariables {
  password: string;
  keepActiveProfile: boolean;
  requirements: ResolvedRequirementStatus[];
  /** Server content or required mods have to be staged before launching. */
  needsMods: boolean;
}

const waitForGameExit = async (): Promise<boolean> => {
  const deadline = Date.now() + GAME_EXIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await isGameRunning())) return true;
    await new Promise((resolve) => setTimeout(resolve, GAME_EXIT_POLL_MS));
  }
  return false;
};

/**
 * Runs the whole join: restore or stage gameinfo.gi, restart the game if that
 * changed anything, then hand off to `joinServer`.
 */
export const useJoinServer = (
  server: ServerBrowserEntry | null,
  stager: ReturnType<typeof useServerStage>,
) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const settings = usePersistedStore((s) => s.settings);
  const gamePresenceEnabled = usePersistedStore((s) => s.gamePresenceEnabled);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const clearLastJoin = usePersistedStore((s) => s.clearLastJoin);

  /** gameinfo.gi is only read at startup, so our changes need a restart. */
  const ensureGameClosed = async (): Promise<boolean> => {
    const shouldRestart = await confirm({
      title: t("servers.join.gameRunning.title"),
      body: t("servers.join.gameRunning.body"),
      actionButton: t("servers.join.gameRunning.restart"),
      cancelButton: t("common.cancel"),
      actionButtonVariant: "default",
    });
    if (!shouldRestart) return false;

    toast.info(t("servers.join.stopping"));
    try {
      await invoke("stop_game");
    } catch (error) {
      logger.withError(error).warn("Failed to stop the game before joining");
    }

    if (await waitForGameExit()) return true;

    toast.error(t("servers.join.gameStillRunning"));
    return false;
  };

  const reportOutcome = (outcome: JoinResult, name: string): void => {
    switch (outcome.kind) {
      case "cancelled":
        return;
      case "gateway":
        toast.info(t("servers.detail.openExternal"));
        return;
      case "launched":
        toast.success(
          outcome.watched
            ? t("servers.join.launchedWatched", { name })
            : t("servers.join.launched", { name }),
        );
        if (outcome.passwordSkipped) {
          toast.warning(t("servers.join.passwordSkipped"), {
            duration: 15_000,
          });
        }
        return;
      case "steam-url":
        toast.success(t("servers.join.launched", { name }));
        return;
      case "manual":
        toast.warning(t("servers.join.manual", { code: outcome.code }), {
          duration: 20_000,
        });
        return;
      case "no-connect-method":
        toast.error(t("servers.join.noConnectMethod"));
        return;
      default: {
        const exhaustive: never = outcome;
        logger
          .withMetadata({ outcome: exhaustive })
          .warn("Unhandled join outcome");
      }
    }
  };

  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({
      password,
      keepActiveProfile,
      requirements,
      needsMods,
    }: JoinVariables): Promise<JoinResult> => {
      if (!server) return { kind: "cancelled" };

      const additionalArgs = await getAdditionalArgs(
        Object.values(settings),
        gamePresenceEnabled,
      );

      // The gateway path just opens a URL; nothing touches the game install.
      if (server.gateway_url) {
        return await joinServer({
          server,
          password,
          additionalArgs,
          gameRunning: false,
        });
      }

      // Staging always rewrites gameinfo.gi. Without mods we only need a
      // restart if a previous join actually left something behind.
      let needsRestart = needsMods;
      if (!needsMods) {
        const restored = await restoreProfileGameinfo(
          getActiveProfile()?.folderName ?? null,
        );
        if (restored) {
          clearLastJoin();
          needsRestart = true;
        }
      }

      let gameRunning = await isGameRunning();
      if (needsRestart && gameRunning) {
        if (!(await ensureGameClosed())) return { kind: "cancelled" };
        gameRunning = false;
      }

      if (needsMods) {
        await stager.stage(server, {
          layered: keepActiveProfile,
          requirements,
        });
      }

      return await joinServer({
        server,
        password,
        additionalArgs,
        gameRunning,
      });
    },
    onSuccess: (outcome) => {
      reportOutcome(outcome, server?.name ?? "");
    },
    onError: (error) => {
      logger.withError(error).error("Server join failed");
      toast.error(getErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["is-game-running"] });
    },
  });
};
