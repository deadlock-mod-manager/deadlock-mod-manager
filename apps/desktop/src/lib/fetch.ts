import type { ClientOptions } from "@tauri-apps/plugin-http";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { createLogger } from "./logger";
import { usePersistedStore } from "./store";

const logger = createLogger("http");

type TauriFetchParams = Parameters<typeof tauriFetch>;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

const sanitizeHeaders = (
  headers: HeadersInit | undefined,
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!headers) return result;

  const entries =
    headers instanceof Headers
      ? headers.entries()
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);

  for (const [key, value] of entries) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? "[REDACTED]"
      : value;
  }

  return result;
};

const getRequestUrl = (input: TauriFetchParams[0]): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const getRequestMethod = (
  input: TauriFetchParams[0],
  init: TauriFetchParams[1],
): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const getProxyOptions = (): ClientOptions["proxy"] => {
  const { proxyConfig } = usePersistedStore.getState();
  if (!proxyConfig.enabled || !proxyConfig.host || proxyConfig.port <= 0) {
    return undefined;
  }

  const proxyUrl = `${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`;
  return {
    all: {
      url: proxyUrl,
      basicAuth:
        proxyConfig.authEnabled && proxyConfig.username
          ? {
              username: proxyConfig.username,
              password: proxyConfig.password,
            }
          : undefined,
      noProxy: proxyConfig.noProxy || undefined,
    },
  };
};

export const fetch: typeof tauriFetch = async (input, init) => {
  const url = getRequestUrl(input);
  const method = getRequestMethod(input, init);
  const startTime = performance.now();

  logger
    .withMetadata({
      method,
      url,
      headers: sanitizeHeaders(init?.headers),
    })
    .debug("HTTP request");

  const proxy = getProxyOptions();
  const mergedInit = proxy ? { ...init, proxy } : init;

  const response = await tauriFetch(input, mergedInit);

  const duration = Math.round(performance.now() - startTime);

  const meta = {
    method,
    url,
    status: response.status,
    duration: `${duration}ms`,
  };

  if (response.ok) {
    logger.withMetadata(meta).debug("HTTP response");
  } else {
    logger.withMetadata(meta).warn("HTTP response error");
  }

  return response;
};
