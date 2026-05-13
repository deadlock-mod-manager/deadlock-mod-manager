export type ErrorKind = {
  kind:
    | "io"
    | "utf8"
    | "steamNotFound"
    | "gameNotFound"
    | "gamePathNotSet"
    | "appHandleNotInitialized"
    | "gameConfigParse"
    | "modAlreadyInstalled"
    | "modFileNotFound"
    | "registry"
    | "keyValues"
    | "rar"
    | "zip"
    | "modInvalid"
    | "unknown"
    | "gameRunning"
    | "gameNotRunning"
    | "gameLaunchFailed"
    | "failedToOpenFolder"
    | "modExtractionFailed"
    | "invalidInput"
    | "unauthorizedPath"
    | "networkError"
    | "tauri"
    | "backupCreationFailed"
    | "backupRestoreFailed"
    | "backupNotFound"
    | "downloadFailed"
    | "downloadCancelled"
    | "fileWriteFailed"
    | "autoexecReadFailed"
    | "autoexecWriteFailed"
    | "rollbackFailed"
    | "backgroundTaskFailed"
    | "vpkInUse";
  message: string;
};

export function isTauriError(
  error: object | null | unknown,
): error is ErrorKind {
  return (
    error !== null &&
    typeof error === "object" &&
    "kind" in error &&
    "message" in error
  );
}
