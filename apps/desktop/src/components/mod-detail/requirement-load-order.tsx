import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { useMakeConflictWinner } from "@/hooks/use-profile-conflicts";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

export function RequirementLoadOrder({
  modId,
  requirementId,
}: {
  modId: string;
  requirementId: string;
}) {
  const { t } = useTranslation();
  const fixOrder = useMakeConflictWinner();
  const canMove = usePersistedStore((state) => {
    const mod = state.localMods.find((item) => item.remoteId === modId);
    const requirement = state.localMods.find(
      (item) => item.remoteId === requirementId,
    );
    return (
      mod?.status === ModStatus.Installed &&
      requirement?.status === ModStatus.Installed &&
      mod.installOrder !== undefined &&
      requirement.installOrder !== undefined &&
      mod.installOrder > requirement.installOrder
    );
  });
  if (!canMove) return null;
  return (
    <Button
      size='sm'
      variant='outline'
      disabled={fixOrder.isPending}
      onClick={() =>
        fixOrder.mutate({ newWinner: modId, currentWinner: requirementId })
      }>
      {t("modDependencies.loadFirst")}
    </Button>
  );
}
