import type {
  DetectedArchitecture,
  DetectedOS,
  OSInfo,
} from '@/types/releases';

/**
 * Detects the user's operating system and architecture from the user agent
 */
export function detectOS(): OSInfo {
  if (typeof window === 'undefined') {
    return {
      os: 'unknown',
      architecture: 'unknown',
      displayName: 'Unknown OS',
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || '';

  let os: DetectedOS = 'unknown';
  let architecture: DetectedArchitecture = 'unknown';
  let displayName = 'Unknown OS';

  // Detect OS
  if (userAgent.includes('win') || platform.includes('win')) {
    os = 'windows';
    displayName = 'Windows';
  } else if (userAgent.includes('mac') || platform.includes('mac')) {
    os = 'macos';
    displayName = 'macOS';
  } else if (userAgent.includes('linux') || platform.includes('linux')) {
    os = 'linux';
    displayName = 'Linux';
  }

  // Detect architecture
  // Check for ARM64/Apple Silicon
  if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
    architecture = 'arm64';
  } else if (
    userAgent.includes('x86_64') ||
    userAgent.includes('x64') ||
    userAgent.includes('wow64') ||
    userAgent.includes('win64') ||
    platform.includes('64')
  ) {
    architecture = 'x64';
  } else if (userAgent.includes('arm') || platform.includes('arm')) {
    architecture = 'arm64'; // Modern ARM is typically 64-bit
  } else {
    // Default to x64 for most modern systems
    architecture = 'x64';
  }

  // Special handling for Apple Silicon Macs
  if (
    os === 'macos' &&
    (userAgent.includes('arm64') || userAgent.includes('aarch64'))
  ) {
    architecture = 'arm64';
    displayName = 'macOS (Apple Silicon)';
  } else if (os === 'macos' && architecture === 'x64') {
    displayName = 'macOS (Intel)';
  }

  return { os, architecture, displayName };
}

/**
 * Gets a human-readable platform string
 */
export function getPlatformDisplayName(
  platform: string,
  architecture?: string
): string {
  switch (platform.toLowerCase()) {
    case 'windows':
      return architecture === 'arm64' ? 'Windows (ARM64)' : 'Windows';
    case 'macos':
      return architecture === 'arm64'
        ? 'macOS (Apple Silicon)'
        : 'macOS (Intel)';
    case 'linux':
      return architecture === 'arm64' ? 'Linux (ARM64)' : 'Linux';
    default:
      return platform;
  }
}

/**
 * Formats file size in a human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Formats download count in a human-readable format
 */
export function formatDownloadCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * Gets the appropriate icon for each platform
 */
export function getPlatformIcon(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'windows':
      return '🪟';
    case 'macos':
      return '🍎';
    case 'linux':
      return '🐧';
    default:
      return '💾';
  }
}
