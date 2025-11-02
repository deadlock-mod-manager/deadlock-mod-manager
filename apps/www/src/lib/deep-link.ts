export function generateDeepLink(
  downloadUrl: string,
  isAudio: boolean,
  modId: string,
): string {
  if (!downloadUrl) {
    throw new Error("Download URL is required");
  }

  if (!modId) {
    throw new Error("Mod ID is required");
  }

  const modType = isAudio ? "Sound" : "Mod";

  return `deadlock-mod-manager:${downloadUrl},${modType},${modId}`;
}

export function isDeepLinkSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const isWindows = navigator.userAgent.includes("Windows");
  const isMac = navigator.userAgent.includes("Mac");
  const isLinux =
    navigator.userAgent.includes("Linux") &&
    !navigator.userAgent.includes("Android");

  return isWindows || isMac || isLinux;
}
