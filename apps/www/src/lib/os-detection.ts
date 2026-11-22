import type {
  DetectedArchitecture,
  DetectedOS,
  OSInfo,
} from "@/types/releases";

type MobileOS = "android" | "ios" | "ipados";

export interface DeviceInfo extends OSInfo {
  mobile: MobileOS | null;
}

const mobileDisplayNames = {
  android: "Android",
  ios: "iOS",
  ipados: "iPadOS",
} satisfies Record<MobileOS, string>;

const detectMobileOS = (
  userAgent: string,
  maxTouchPoints: number,
): MobileOS | null => {
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("iphone") || userAgent.includes("ipod")) return "ios";
  if (userAgent.includes("ipad")) return "ipados";
  if (userAgent.includes("macintosh") && maxTouchPoints > 1) return "ipados";
  return null;
};

export function detectOS(): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      os: "unknown",
      architecture: "unknown",
      displayName: "Unknown OS",
      mobile: null,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || "";

  const mobile = detectMobileOS(
    userAgent,
    window.navigator.maxTouchPoints ?? 0,
  );
  if (mobile) {
    return {
      os: "unknown",
      architecture: "unknown",
      displayName: mobileDisplayNames[mobile],
      mobile,
    };
  }

  let os: DetectedOS = "unknown";
  let architecture: DetectedArchitecture = "unknown";
  let displayName = "Unknown OS";

  if (userAgent.includes("win") || platform.includes("win")) {
    os = "windows";
    displayName = "Windows";
  } else if (userAgent.includes("mac") || platform.includes("mac")) {
    os = "macos";
    displayName = "macOS";
  } else if (userAgent.includes("linux") || platform.includes("linux")) {
    os = "linux";
    displayName = "Linux";
  }

  if (userAgent.includes("arm64") || userAgent.includes("aarch64")) {
    architecture = "arm64";
  } else if (
    userAgent.includes("x86_64") ||
    userAgent.includes("x64") ||
    userAgent.includes("wow64") ||
    userAgent.includes("win64") ||
    platform.includes("64")
  ) {
    architecture = "x64";
  } else if (userAgent.includes("arm") || platform.includes("arm")) {
    architecture = "arm64";
  } else {
    architecture = "x64";
  }

  if (
    os === "macos" &&
    (userAgent.includes("arm64") || userAgent.includes("aarch64"))
  ) {
    architecture = "arm64";
    displayName = "macOS (Apple Silicon)";
  } else if (os === "macos" && architecture === "x64") {
    displayName = "macOS (Intel)";
  }

  return { os, architecture, displayName, mobile: null };
}

export function getPlatformDisplayName(
  platform: string,
  architecture?: string,
): string {
  switch (platform.toLowerCase()) {
    case "windows":
      return architecture === "arm64" ? "Windows (ARM64)" : "Windows";
    case "macos":
      return architecture === "arm64"
        ? "macOS (Apple Silicon)"
        : "macOS (Intel)";
    case "linux":
      return architecture === "arm64" ? "Linux (ARM64)" : "Linux";
    default:
      return platform;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function formatDownloadCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function getPlatformIcon(platform: string): string {
  switch (platform.toLowerCase()) {
    case "windows":
      return "🪟";
    case "macos":
      return "🍎";
    case "linux":
      return "🐧";
    default:
      return "💾";
  }
}
