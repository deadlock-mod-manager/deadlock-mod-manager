import { isTauriError } from "@/types/tauri";

export function getLaunchErrorMessage<T>(
  error: T,
  gameLaunchFailedMessage: string,
  fallbackMessage: string,
): string {
  if (isTauriError(error)) {
    return error.kind === "gameLaunchFailed"
      ? gameLaunchFailedMessage
      : error.message;
  }

  return error instanceof Error ? error.message : fallbackMessage;
}
