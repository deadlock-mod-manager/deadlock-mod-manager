import { useMutation } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { requestPackAndTest } from "./workbench-actions";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePackGameCloseConfirmation } from "./use-pack-game-close-confirmation";
import { useStartGame } from "@/components/providers/launch-repair";
import { useLaunchProgress } from "@/lib/launch-progress";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";

import { packAndTest, type Phase } from "./pack-and-test";

export const usePackAndTest = (addon: ModdingAddon, onCompiled: () => void) => {
  const { t } = useTranslation();
  const startGame = useStartGame();
  const launchPending = useLaunchProgress((state) =>
    Boolean(state.progress?.current),
  );
  const confirmClose = usePackGameCloseConfirmation();
  const [phase, setPhase] = useState<Phase>("checkingGame");
  const mutation = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: async () => {
      if (getCurrentWindow().label === "workbench-compare") {
        const result = await requestPackAndTest(addon.id, setPhase);
        onCompiled();
        return result;
      }
      return packAndTest(
        addon,
        startGame,
        setPhase,
        onCompiled,
        t,
        confirmClose,
      );
    },
  });
  return { ...mutation, phase, launchPending };
};
