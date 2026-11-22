import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  useCompatibilityReview,
  useLaunchFixPrompt,
} from "@/components/providers/compatibility-review";
import { fixMods } from "@/hooks/use-mod-health";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import {
  heldBackPromptKey,
  heldBackToAsk,
  launchFixDecision,
} from "@/lib/mods/mod-health";
import {
  invalidateModHealth,
  modHealthQueryKey,
} from "@/lib/mods/mod-health-queries";
import { usePersistedStore } from "@/lib/store";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";
import { ModStatus } from "@/types/mods";

const ASKED_STORAGE_KEY = "mod-health.asked-held-back";

const askedSchema = z.array(z.string());

const askedHeldBack = (): Set<string> => {
  try {
    return new Set(
      askedSchema.parse(
        JSON.parse(window.localStorage.getItem(ASKED_STORAGE_KEY) ?? "[]"),
      ),
    );
  } catch {
    return new Set();
  }
};

const rememberHeldBack = (mods: readonly ModHealth[]) => {
  const asked = askedHeldBack();
  for (const health of mods) asked.add(heldBackPromptKey(health));
  window.localStorage.setItem(ASKED_STORAGE_KEY, JSON.stringify([...asked]));
};

/**
 * Fixes enabled mods made for an older game version before a modded launch,
 * asking first unless the player turned on automatic fixes. Mods that
 * automatic fixes skip are asked about once per game build and finding set.
 * Resolves false when the player backs out, so the launch stops.
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
    const report = queryClient.getQueryData<ModHealthReport>(
      modHealthQueryKey(profileFolder),
    );
    const isEnabled = (modId: string) =>
      state.localMods.some(
        (mod) => mod.remoteId === modId && mod.status === ModStatus.Installed,
      ) && state.isModEnabledInCurrentProfile(modId);
    const decision = launchFixDecision({
      report,
      isEnabled,
      autoFixMods: state.autoFixMods,
    });
    const heldBack = heldBackToAsk({
      report,
      isEnabled,
      asked: askedHeldBack(),
    });
    let modIds = decision.action === "launch" ? [] : decision.modIds;

    if (decision.action === "ask") {
      beforeDialog();
      const choice = await askLaunchFix({
        kind: "autoFixOff",
        count: modIds.length,
      });
      if (choice === "cancel") return false;
      if (choice === "launch") modIds = [];
    }

    if (heldBack.length > 0) {
      beforeDialog();
      const choice = await askLaunchFix({
        kind: "heldBack",
        mods: heldBack.map((health) => ({
          name:
            state.localMods.find((mod) => mod.remoteId === health.modId)
              ?.name ?? health.modId,
          health,
        })),
      });
      if (choice === "cancel") return false;
      rememberHeldBack(heldBack);
      if (choice === "fix") {
        modIds = [...modIds, ...heldBack.map((health) => health.modId)];
      }
    }
    if (modIds.length === 0) return true;

    try {
      const outcome = await fixMods(profileFolder, modIds, (folder) => {
        beforeDialog();
        return review(folder, { launchAfterApply: true });
      });
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
