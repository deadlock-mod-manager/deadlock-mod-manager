import { onError, ORPCError, ValidationError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { logger } from "@/lib/logger";
import { appRouter } from "@/routers";

function extractValidationIssues(
  error: unknown,
): Record<string, unknown> | undefined {
  if (!(error instanceof ORPCError)) {
    return undefined;
  }

  if (!(error.cause instanceof ValidationError)) {
    return undefined;
  }

  return {
    validationIssues: error.cause.issues,
  };
}

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      const validationDetails = extractValidationIssues(error);
      const isError = error instanceof Error;
      const errorDetails = {
        name: isError ? error.name : undefined,
        message: isError ? error.message : String(error),
        code: error instanceof ORPCError ? error.code : undefined,
        ...validationDetails,
      };
      logger
        .withMetadata(errorDetails)
        .withError(isError ? error : new Error(String(error)))
        .error("Error handling RPC request");
    }),
  ],
});
