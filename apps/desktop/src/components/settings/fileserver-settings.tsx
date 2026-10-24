import { toast } from "@deadlock-mods/ui/components/sonner";
import { Link, Zap } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { FileserverPreference } from "@/lib/store/slices/network";
import { MetaCard } from "./meta-card";

export const FileserverSettings = () => {
  const { t } = useTranslation();
  const fileserverPreference = usePersistedStore((s) => s.fileserverPreference);
  const setFileserverPreference = usePersistedStore(
    (s) => s.setFileserverPreference,
  );

  const select = (value: FileserverPreference) => {
    setFileserverPreference(value);
    toast.success(t("settings.fileserverPreferenceSaved"));
  };

  return (
    <div
      aria-label={t("settings.fileserverModeHeading")}
      className='grid grid-cols-1 gap-3 sm:grid-cols-2'
      role='radiogroup'>
      <MetaCard
        badge={t("settings.fileserverRecommended")}
        description={t("settings.fileserverDefault")}
        icon={Link}
        label={t("settings.fileserverDefaultTitle")}
        onClick={() => select("default")}
        selected={fileserverPreference === "default"}
      />
      <MetaCard
        description={t("settings.fileserverAuto")}
        icon={Zap}
        label={t("settings.fileserverAutoTitle")}
        onClick={() => select("auto")}
        selected={fileserverPreference === "auto"}
      />
    </div>
  );
};
