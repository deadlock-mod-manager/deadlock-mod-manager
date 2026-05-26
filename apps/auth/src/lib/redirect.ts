import { logger } from "./logger";
import { env } from "./env";

const DEFAULT_REDIRECT = "/";

export const validateRedirectUrl = (
  returnTo: string,
  baseURL: string,
): string => {
  const trustedOrigins = env.CORS_ORIGIN;

  if (!returnTo || returnTo === DEFAULT_REDIRECT) {
    return DEFAULT_REDIRECT;
  }

  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    try {
      const normalized = new URL(returnTo, baseURL);
      if (normalized.origin === new URL(baseURL).origin) {
        return normalized.pathname + normalized.search + normalized.hash;
      }
    } catch {
      logger.withMetadata({ returnTo }).warn("Invalid relative redirect URL");
    }
    return DEFAULT_REDIRECT;
  }

  try {
    const parsedUrl = new URL(returnTo);

    const isTrustedOrigin = trustedOrigins.some((trustedOrigin) => {
      try {
        const trusted = new URL(trustedOrigin);
        return parsedUrl.origin === trusted.origin;
      } catch {
        return false;
      }
    });

    if (isTrustedOrigin) {
      return returnTo;
    }

    logger
      .withMetadata({ returnTo, origin: parsedUrl.origin })
      .warn("Redirect URL blocked: untrusted origin");
  } catch {
    logger.withMetadata({ returnTo }).warn("Invalid redirect URL format");
  }

  return DEFAULT_REDIRECT;
};
