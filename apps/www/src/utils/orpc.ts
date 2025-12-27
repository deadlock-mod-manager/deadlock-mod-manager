import { toast } from "@deadlock-mods/ui/components/sonner";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { SERVER_URL } from "@/lib/config";
import type { AppRouterClient } from "../../../api/src/routers/index";

let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});

export const link = new RPCLink({
  url: `${SERVER_URL}/rpc`,
  fetch(url, options) {
    const headers = new Headers(
      (options as RequestInit | undefined)?.headers || {},
    );

    if (currentAccessToken) {
      headers.set("Authorization", `Bearer ${currentAccessToken}`);
    }

    return fetch(url, {
      ...(options as RequestInit | undefined),
      headers,
      credentials: "include",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
