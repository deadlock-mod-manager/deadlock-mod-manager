import { createTTLCache } from "@deadlock-mods/common";

export const DEFAULT_TIMEOUT_SECONDS = 30;
export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_CACHE_MAX_ENTRIES = 100;

/**
 * Shared cache for web search results
 */
export const searchCache = createTTLCache<string, Record<string, unknown>>({
  max: DEFAULT_CACHE_MAX_ENTRIES,
  ttl: DEFAULT_CACHE_TTL_MS,
});

/**
 * Shared cache for web fetch results
 */
export const fetchCache = createTTLCache<string, Record<string, unknown>>({
  max: DEFAULT_CACHE_MAX_ENTRIES,
  ttl: DEFAULT_CACHE_TTL_MS,
});

export function clampInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function normalizeCacheKey(value: string): string {
  return value.trim().toLowerCase();
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  if (timeoutMs <= 0) {
    return signal ?? new AbortController().signal;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
  };

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        cleanup();
        controller.abort();
      },
      { once: true },
    );
  }

  controller.signal.addEventListener("abort", cleanup, { once: true });

  return controller.signal;
}

export async function readResponseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Validates a URL is http/https
 */
export function validateHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL: must be a valid http or https URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid URL: must be http or https");
  }

  return parsed;
}

/**
 * Extract hostname from URL for display purposes
 */
export function extractHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
