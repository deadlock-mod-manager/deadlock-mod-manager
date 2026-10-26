export type ErrorKind = {
  kind:
    | "io"
    | "readOnlyFile"
    | "makeWritableFailed"
    | "utf8"
    | "steamNotFound"
    | "steamRunning"
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
    | "modelConflict"
    | "duplicateVpkOwnership"
    | "unknown"
    | "gameRunning"
    | "gameNotRunning"
    | "gameLaunchFailed"
    | "modDataReviewRequired"
    | "missingEnabledModFiles"
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
    | "launchCancelled"
    | "providerCancelled"
    | "fileWriteFailed"
    | "autoexecReadFailed"
    | "autoexecWriteFailed"
    | "crosshairConfigResetFailed"
    | "rollbackFailed"
    | "backgroundTaskFailed"
    | "vpkInUse";
  message: string;
  affectedMods?: { id: string; name: string }[];
  conflictingMods?: string[];
  path?: string;
  profileFolder?: string;
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
