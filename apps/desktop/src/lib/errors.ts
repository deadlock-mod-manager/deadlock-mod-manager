export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return "An unexpected error occurred";
}
