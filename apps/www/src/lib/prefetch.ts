import {
  type FetchQueryOptions,
  isServer,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

const LOADER_DATA_TIMEOUT_MS = 2000;

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
