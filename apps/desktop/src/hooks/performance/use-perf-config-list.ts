import { useMemo } from "react";
import {
  usePerfCatalog,
  usePerfResolve,
  usePerfStatus,
} from "@/hooks/performance/use-perf-queries";
import { buildConfigList } from "@/lib/performance/config-list";
import { savedDraftFor } from "@/lib/performance/editor/configs";
import { usePersistedStore } from "@/lib/store";

export const useStoredRequestOptions = (configId: string) => {
  const { data: status } = usePerfStatus();
  const desired = status?.desired ?? null;
  const savedOverrides = usePersistedStore((state) => state.perfOverrides);
  const savedInclude = usePersistedStore(
    (state) => state.perfIncludeEngineSections,
  );
  const savedVideo = usePersistedStore((state) => state.perfVideoChoices);
  return useMemo(
    () =>
      savedDraftFor(
        configId,
        {
          overrides: savedOverrides,
          includeEngineSections: savedInclude,
          video: savedVideo,
        },
        desired,
      ),
    [configId, savedOverrides, savedInclude, savedVideo, desired],
  );
};

export const usePerfConfigList = () => {
  const catalogQuery = usePerfCatalog();
  const statusQuery = usePerfStatus();
  const desired = statusQuery.data?.desired ?? null;
  const activeResolved = usePerfResolve(desired?.request ?? null);
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);
  const activeConfigId = desired?.request.configId ?? null;
  const activeCutScore = activeResolved.data?.cutScore ?? null;

  const items = useMemo(
    () =>
      buildConfigList(
        catalogQuery.data,
        userConfigs,
        activeConfigId !== null && activeCutScore !== null
          ? { configId: activeConfigId, cutScore: activeCutScore }
          : null,
      ),
    [catalogQuery.data, userConfigs, activeConfigId, activeCutScore],
  );

  const activeItem =
    items.find((item) => item.configId === activeConfigId) ?? null;

  return {
    catalogQuery,
    statusQuery,
    desired,
    activeResolved,
    items,
    activeItem,
    activeConfigId,
    activeCutScore,
  };
};
