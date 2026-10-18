import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useCompatibilityReview,
  useLaunchFixPrompt,
} from "@/components/providers/compatibility-review";
import { fixMods } from "@/hooks/use-mod-health";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { launchFixDecision } from "@/lib/mods/mod-health";
import {
  invalidateModHealth,
  modHealthQueryKey,
} from "@/lib/mods/mod-health-queries";
import { usePersistedStore } from "@/lib/store";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";
import { ModStatus } from "@/types/mods";

/**
 * Fixes enabled mods made for an older game version before a modded launch,
 * asking first unless the player turned on automatic fixes. Resolves false
 * when the player backs out, so the launch stops.
 */
export const useLaunchFixes = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const review = useCompatibilityReview();
  const askLaunchFix = useLaunchFixPrompt();

  return async (
    profileFolder: string | null,
    beforeDialog: () => void,
  ): Promise<boolean> => {
    const state = usePersistedStore.getState();
    const decision = launchFixDecision({
      report: queryClient.getQueryData<ModHealthReport>(
        modHealthQueryKey(profileFolder),
      ),
      isEnabled: (modId) =>
        state.localMods.some(
          (mod) => mod.remoteId === modId && mod.status === ModStatus.Installed,
        ) && state.isModEnabledInCurrentProfile(modId),
      autoFixMods: state.autoFixMods,
    });
    if (decision.action === "launch") return true;

    if (decision.action === "ask") {
      beforeDialog();
      const choice = await askLaunchFix(decision.modIds.length);
      if (choice !== "fix") return choice === "launch";
    }

    try {
      const outcome = await fixMods(
        profileFolder,
        decision.modIds,
        (folder) => {
          beforeDialog();
          return review(folder, { launchAfterApply: true });
        },
      );
      return outcome !== "cancelled";
    } catch (error) {
      // The mods still load with their original files, so a failed fix
      // should not cost the player their launch.
      logger.withError(error).error("Could not fix mods before launch");
      toast.error(t("modHealth.fixFailed"), {
        description: getErrorMessage(error),
      });
      return true;
    } finally {
      await invalidateModHealth(queryClient);
    }
  };
};
