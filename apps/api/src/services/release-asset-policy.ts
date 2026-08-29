import type {
  GitHubRelease,
  PlatformDownload,
  RuntimeKind,
} from "../types/github-releases";

export interface ParsedReleaseAsset {
  platform: "windows" | "macos" | "linux";
  architecture: "x64" | "arm64" | "universal";
  installerType: "exe" | "msi" | "dmg" | "deb" | "rpm" | "flatpak" | "sig";
  runtime: RuntimeKind;
}

const getRuntime = (name: string): RuntimeKind =>
  /(?:^|[.-])cef(?:[.-]|$)/.test(name) ? "cef" : "wry";

const getLinuxArchitecture = (name: string): "x64" | "arm64" =>
  name.includes("arm64") || name.includes("aarch64") ? "arm64" : "x64";

export const parseReleaseAsset = (
  filename: string,
): ParsedReleaseAsset | null => {
  const name = filename.toLowerCase();
  const runtime = getRuntime(name);

  if (name.endsWith(".msi.sig")) {
    return {
      platform: "windows",
      architecture: name.includes("arm64") ? "arm64" : "x64",
      installerType: "sig",
      runtime,
    };
  }

  if (name.endsWith(".msi")) {
    return {
      platform: "windows",
      architecture: name.includes("arm64") ? "arm64" : "x64",
      installerType: "msi",
      runtime,
    };
  }

  if (name.endsWith(".exe") || name.endsWith(".exe.sig")) {
    return {
      platform: "windows",
      architecture: name.includes("arm64") ? "arm64" : "x64",
      installerType: name.endsWith(".sig") ? "sig" : "exe",
      runtime,
    };
  }

  if (
    name.includes("windows") ||
    name.includes("win32") ||
    name.includes("win64")
  ) {
    return {
      platform: "windows",
      architecture: name.includes("arm64") ? "arm64" : "x64",
      installerType: "exe",
      runtime,
    };
  }

  if (
    name.includes(".dmg") ||
    name.includes("macos") ||
    name.includes("darwin")
  ) {
    const architecture = name.includes("arm64")
      ? "arm64"
      : name.includes("x64") || name.includes("x86_64")
        ? "x64"
        : "universal";
    return {
      platform: "macos",
      architecture,
      installerType: "dmg",
      runtime,
    };
  }

  if (name.endsWith(".deb.sig") || name.endsWith(".rpm.sig")) {
    return {
      platform: "linux",
      architecture: getLinuxArchitecture(name),
      installerType: "sig",
      runtime,
    };
  }

  if (name.endsWith(".flatpak")) {
    return {
      platform: "linux",
      architecture: getLinuxArchitecture(name),
      installerType: "flatpak",
      runtime,
    };
  }

  if (name.endsWith(".deb")) {
    return {
      platform: "linux",
      architecture: getLinuxArchitecture(name),
      installerType: "deb",
      runtime,
    };
  }

  if (name.endsWith(".rpm")) {
    return {
      platform: "linux",
      architecture: getLinuxArchitecture(name),
      installerType: "rpm",
      runtime,
    };
  }

  return null;
};

export const transformReleaseAssets = (
  release: GitHubRelease,
): PlatformDownload[] => {
  const downloads: PlatformDownload[] = [];

  for (const asset of release.assets) {
    const parsedAsset = parseReleaseAsset(asset.name);
    if (!parsedAsset) {
      continue;
    }

    downloads.push({
      platform: parsedAsset.platform,
      architecture: parsedAsset.architecture,
      installerType: parsedAsset.installerType,
      runtime: parsedAsset.runtime,
      url: asset.browser_download_url,
      filename: asset.name,
      size: asset.size,
      downloadCount: asset.download_count,
    });
  }

  return downloads.sort((left, right) => {
    if (left.runtime !== right.runtime) {
      return left.runtime === "wry" ? -1 : 1;
    }
    return left.filename.localeCompare(right.filename);
  });
};
