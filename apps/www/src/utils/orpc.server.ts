import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "../../../api/src/routers/index";

/**
 * Server-side ORPC client for use in loaders and server functions.
 * Uses process.env for server-side environment variables.
 */
export const createServerClient = () => {
  const apiUrl =
    process.env.VITE_SERVER_URL ||
    import.meta.env?.VITE_SERVER_URL ||
    "http://localhost:9000";

  const link = new RPCLink({
    url: `${apiUrl}/rpc`,
  });

  return createORPCClient<AppRouterClient>(link);
};

export const serverClient = createServerClient();
