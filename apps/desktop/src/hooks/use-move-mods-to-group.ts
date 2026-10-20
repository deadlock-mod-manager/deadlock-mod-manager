import { toast } from "@deadlock-mods/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ProfileId } from "@/types/profiles";

export const useMoveModsToGroup = () => {
  const { t } = useTranslation();
  return (
    profileId: ProfileId,
    modIds: readonly string[],
    groupId: string | null,
  ) => {
    const state = usePersistedStore.getState();
    const move = state.assignModsToGroup(profileId, modIds, groupId);
    if (!move) return;
    const name =
      state.profiles[profileId]?.modGroups?.find(
        (group) => group.id === groupId,
      )?.name ?? t("myMods.groups.ungrouped");
    toast.success(
      t("myMods.groups.moved", { count: move.previous.length, name }),
      {
        id: "mod-group-move",
        duration: 8000,
        action: {
          label: t("myMods.groups.undo"),
          onClick: () => usePersistedStore.getState().undoModGroupMove(move),
        },
      },
    );
  };
};
