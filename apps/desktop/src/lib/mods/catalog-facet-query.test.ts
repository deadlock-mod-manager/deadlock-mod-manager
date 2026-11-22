import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { CATALOG_QUERY_DEFAULTS } from "@/lib/gamebanana-catalog";
import type { CatalogFacet } from "@/types/generated/CatalogFacet";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";
import { catalogFacetQueryOptions } from "./catalog-facet-query";

let storedFacets: CatalogFacet[] = [];
let pendingFacets: Promise<CatalogFacet[]> | null = null;
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    if (command === "get_gamebanana_catalog_facets")
      return pendingFacets ?? storedFacets;
    throw new Error(`Unexpected command: ${command}`);
  },
}));

const client = new QueryClient();
const destroyObservers: Array<() => void> = [];
afterEach(() => {
  for (const destroy of destroyObservers.splice(0)) destroy();
  client.clear();
  storedFacets = [];
  pendingFacets = null;
});

const browseScopes: Array<Pick<CatalogQuery, "submissionType" | "isMap">> = [
  { submissionType: "sound", isMap: null },
  { submissionType: "wip", isMap: null },
  { submissionType: "mod", isMap: true },
];

for (const scope of browseScopes) {
  test(`changing to ${scope.isMap ? "maps" : scope.submissionType} hides the previous category tree while facets load`, async () => {
    storedFacets = [
      {
        category: "Model Replacement",
        hero: null,
        categoryPath: [{ key: "mod:33154", name: "Model Replacement" }],
      },
    ];
    const initialOptions = catalogFacetQueryOptions({
      ...CATALOG_QUERY_DEFAULTS,
      submissionType: "mod",
      isMap: false,
    });
    await client.prefetchQuery(initialOptions);
    const observer = new QueryObserver(client, initialOptions);
    destroyObservers.push(() => observer.destroy());
    observer.subscribe(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observer.getCurrentResult().data).toEqual(storedFacets);

    const load = Promise.withResolvers<CatalogFacet[]>();
    pendingFacets = load.promise;
    observer.setOptions(
      catalogFacetQueryOptions({ ...CATALOG_QUERY_DEFAULTS, ...scope }),
    );
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().isPending).toBe(true);

    const scopedFacets: CatalogFacet[] = [
      {
        category: scope.isMap ? "Maps" : "Other/Misc",
        hero: null,
        categoryPath: [
          { key: `${scope.submissionType}:123`, name: "Scoped category" },
        ],
      },
    ];
    load.resolve(scopedFacets);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observer.getCurrentResult().data).toEqual(scopedFacets);
  });
}

test("returning from a hydrated mod detail refreshes fresh cached category options", async () => {
  const options = catalogFacetQueryOptions({
    ...CATALOG_QUERY_DEFAULTS,
    submissionType: "mod",
  });
  await client.prefetchQuery(options);
  const initial = new QueryObserver(client, options);
  destroyObservers.push(() => initial.destroy());
  const leaveCatalog = initial.subscribe(() => {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(initial.getCurrentResult().data).toEqual([]);
  expect(initial.getCurrentResult().isStale).toBe(false);
  leaveCatalog();

  // Opening a detail hydrates the local record while the list query is fresh.
  storedFacets = [
    {
      category: "Model Replacement",
      hero: null,
      categoryPath: [
        { key: "mod:33154", name: "Model Replacement" },
        { key: "mod:44458", name: "Walker" },
      ],
    },
  ];
  const returned = new QueryObserver(client, options);
  destroyObservers.push(() => returned.destroy());
  returned.subscribe(() => {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(returned.getCurrentResult().data).toEqual(storedFacets);
});
