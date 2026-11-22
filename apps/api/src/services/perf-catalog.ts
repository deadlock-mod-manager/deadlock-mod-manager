import { type Catalog, loadCatalog } from "@deadlock-mods/perf-catalog";

const CACHE_CONTROL = "public, max-age=3600";

let catalog: Catalog | null = null;

/** The catalog this build of the API ships, validated once on first use. */
const currentCatalog = (): Catalog => {
  catalog ??= loadCatalog();
  return catalog;
};

export const catalogEtag = (version: string): string => `"${version}"`;

export const etagMatches = (
  ifNoneMatch: string | undefined,
  etag: string,
): boolean =>
  ifNoneMatch?.split(",").some((candidate) => {
    const tag = candidate.trim().replace(/^W\//, "");
    return tag === "*" || tag === etag;
  }) ?? false;

type PerfCatalogResponse =
  | { status: 304; headers: Record<string, string> }
  | { status: 200; headers: Record<string, string>; body: Catalog };

export const perfCatalogResponse = (
  ifNoneMatch: string | undefined,
  source: Catalog = currentCatalog(),
): PerfCatalogResponse => {
  const etag = catalogEtag(source.version);
  const headers = { "Cache-Control": CACHE_CONTROL, ETag: etag };
  if (etagMatches(ifNoneMatch, etag)) return { status: 304, headers };
  return { status: 200, headers, body: source };
};
