import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { logger } from "@/lib/logger";
import { appRouter } from "@/routers";

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logger.withError(error).error("Error handling RPC request");
    }),
  ],
});
