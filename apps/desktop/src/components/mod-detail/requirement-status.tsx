import { Badge } from "@deadlock-mods/ui/components/badge";
import { useTranslation } from "react-i18next";
import { useRequirementState } from "@/hooks/use-requirement-state";
import type { ModDependency } from "@/types/dependencies";

export function RequirementStatus({
  dependency,
}: {
  dependency: ModDependency;
}) {
  const { t } = useTranslation();
  const state = useRequirementState(dependency);
  return (
    <Badge
      variant='outline'
      className={
        state === "met"
          ? "shrink-0 text-muted-foreground"
          : "shrink-0 border-amber-500/50 text-amber-600 dark:text-amber-400"
      }>
      {t(
        `modDependencies.state.${state === "met" && dependency.mustBeDisabled ? "off" : state}`,
      )}
    </Badge>
  );
}
