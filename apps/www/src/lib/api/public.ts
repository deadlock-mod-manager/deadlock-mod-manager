import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createServerFn } from "@tanstack/react-start";
import type { AppRouterClient } from "../../../../api/src/routers/index";
import { SERVER_URL } from "../config";

function createPublicClient(): AppRouterClient {
  const link = new RPCLink({
    url: `${SERVER_URL}/rpc`,
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include",
      });
    },
  });
  return createORPCClient(link);
}

export const listModsV2 = createServerFn({ method: "GET" }).handler(
  async () => {
    const client = createPublicClient();
    return client.listModsV2();
  },
);

export const getModV2 = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const client = createPublicClient();
    return client.getModV2({ id: data.id });
  });
