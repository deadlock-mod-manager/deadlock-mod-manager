import { usePerfCatalog, usePerfStatus } from "./use-perf-queries";

/**
 * The installed and catalog builds when the game is newer than the catalog's
 * convar list, so convars added since then aren't in it yet. `null` otherwise.
 */
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
