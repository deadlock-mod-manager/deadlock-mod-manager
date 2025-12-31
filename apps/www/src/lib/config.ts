/**
 * Server URL from environment variables.
 */
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "https://api.deadlockmods.app";
export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL || "https://auth.deadlockmods.app";
export const SITE_URL =
  import.meta.env.VITE_SITE_URL || "https://deadlockmods.app";

/**
 * Extract domain from URL for cookie configuration.
 * Returns undefined for localhost to use default browser behavior.
 */
export const getCookieDomain = (): string | undefined => {
  try {
    const url = new URL(SITE_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return undefined;
    }
    return url.hostname;
  } catch {
    return undefined;
  }
};
