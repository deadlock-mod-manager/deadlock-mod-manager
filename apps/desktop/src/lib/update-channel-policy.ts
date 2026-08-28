import type { UpdateTarget } from "./tauri-commands";

const DOWNLOAD_BASE_URL = "https://deadlockmods.app/download";

const downloadInstaller = (
  installer: UpdateTarget["installer"],
): string | null => {
  switch (installer) {
    case "nsis":
      return "exe";
    case "deb":
    case "rpm":
    case "flatpak":
      return installer;
    case "aur":
    case "nix":
    case "unknown":
      return null;
  }
};

export const buildStableRollbackUrl = (target: UpdateTarget): string | null => {
  if (
    target.operatingSystem !== "windows" &&
    target.operatingSystem !== "linux"
  ) {
    return null;
  }
  const installer = downloadInstaller(target.installer);
  if (!installer) return null;

  const search = new URLSearchParams({
    runtime: target.runtime,
    installer,
  });
  return `${DOWNLOAD_BASE_URL}/${target.operatingSystem}?${search.toString()}`;
};
