import {
  type FetchQueryOptions,
  isServer,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

/** How long a route loader waits for API data before rendering without it. */
export const LOADER_DATA_TIMEOUT_MS = 2000;

/**
 * Prefetches a query from a route loader without letting a slow or failing API
 * hold the page hostage.
 *
 * Errors are swallowed: the component renders its own fallback. During SSR, a
 * request that fails or outlives `timeoutMs` is cancelled and dropped from the
 * cache, so the page is server-rendered in its loading state and the browser
 * fetches the data itself after hydration (instead of hydrating into an error
 * or into data the server never rendered). In the browser the request keeps
 * running and the component picks it up when it lands.
 */
export async function prefetchWithin<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  timeoutMs = LOADER_DATA_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  await Promise.race([queryClient.prefetchQuery(options), timeout]);
  clearTimeout(timer);

  if (
    isServer &&
    queryClient.getQueryState(options.queryKey)?.status !== "success"
  ) {
    const filters = { queryKey: options.queryKey, exact: true };
    await queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }
}
