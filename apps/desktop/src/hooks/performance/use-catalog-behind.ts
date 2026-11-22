import { usePerfCatalog, usePerfStatus } from "./use-perf-queries";

export const useCatalogBehind = () => {
  const { data: status } = usePerfStatus();
  const { data: catalog } = usePerfCatalog();
  const installed = Number(status?.buildId);
  const latest = catalog?.convarBuild ?? null;
  if (!Number.isInteger(installed) || latest === null || installed <= latest) {
    return null;
  }
  return { installed, catalog: latest };
};
