/**
 * Hosts we're willing to hand over
 */
const TRUSTED_HOSTS = [
  "gamebanana.com",
  "deadlockmods.app",
  "deadlock-api.com",
] as const;

/**
 * Whether a url that came from remote data is safe to open.
 */
export const isTrustedExternalUrl = (
  url: string | null | undefined,
): url is string => {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  return TRUSTED_HOSTS.some(
    (trusted) => host === trusted || host.endsWith(`.${trusted}`),
  );
};
