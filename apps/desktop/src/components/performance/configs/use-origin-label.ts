import { useTranslation } from "react-i18next";
import { usePerfCatalog } from "@/hooks/performance/use-perf-queries";
import { presetIdFromConfigId } from "@/lib/performance/request";
import { usePersistedStore } from "@/lib/store";
import type { UserPerfConfig } from "@/lib/store/slices/performance";

/** Where one of the user's configs came from, as a short label. */
export const useOriginLabel = () => {
  const { t } = useTranslation();
  const { data: catalog } = usePerfCatalog();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);

  const configName = (configId: string) => {
    const presetId = presetIdFromConfigId(configId);
    if (presetId !== null) {
      return catalog?.presets.find((preset) => preset.id === presetId)?.name;
    }
    return userConfigs[configId]?.name;
  };

  return ({ origin }: UserPerfConfig): string => {
    switch (origin.kind) {
      case "paste":
        return t("performance.origins.paste");
      case "file":
        return origin.fileName
          ? t("performance.origins.fileNamed", { fileName: origin.fileName })
          : t("performance.origins.file");
      case "gamebanana":
        return t("performance.origins.gamebanana");
      case "currentGameinfo":
        return t("performance.origins.currentGameinfo");
      case "modDownload":
        return t("performance.origins.modDownload", {
          modName: origin.modName,
        });
      case "shareCode":
        return t("performance.origins.shareCode");
      case "fork": {
        const name = configName(origin.fromConfigId);
        return name
          ? t("performance.origins.forkOf", { name })
          : t("performance.origins.fork");
      }
    }
  };
};
