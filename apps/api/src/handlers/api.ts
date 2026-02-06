import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError, ValidationError } from "@orpc/server";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
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

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
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
        .error("Error handling API request");
    }),
  ],
});
