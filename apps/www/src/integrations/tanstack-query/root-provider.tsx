import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

const STALE_TIME_WWW = 2 * 60 * 1000;

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_WWW,
        refetchOnWindowFocus: false,
        retry: isServer ? false : 1,
      },
    },
  });
  return {
    queryClient,
  };
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
