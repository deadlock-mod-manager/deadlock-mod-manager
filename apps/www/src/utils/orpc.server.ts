import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SERVER_URL } from "@/lib/config.server";
import type { AppRouterClient } from "../../../api/src/routers/index";

/**
 * Server-side ORPC client for use in loaders and server functions.
 */
export const createServerClient = () => {
  const link = new RPCLink({
    url: `${SERVER_URL}/rpc`,
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include",
      });
    },
  });

  return createORPCClient<AppRouterClient>(link);
};

export const serverClient = createServerClient();
