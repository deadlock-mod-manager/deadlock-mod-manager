import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";

export const FooterNote = ({
  configId,
  desired,
  hasChanges,
}: {
  configId: string;
  desired: DesiredOverlay | null;
  hasChanges: boolean;
}) => {
  const { t } = useTranslation();
  const currentTweaks = usePersistedStore((state) =>
    desired ? (state.perfOverrides[desired.request.configId]?.length ?? 0) : 0,
  );
  if (!desired) return t("performance.details.footer.takesEffect");
  if (desired.request.configId === configId) {
    return hasChanges
      ? t("performance.details.footer.pendingChanges")
      : t("performance.details.footer.active");
  }
  return currentTweaks > 0
    ? t("performance.details.footer.replacesWithTweaks", {
        name: desired.request.name,
        count: currentTweaks,
      })
    : t("performance.details.footer.replaces", { name: desired.request.name });
};
