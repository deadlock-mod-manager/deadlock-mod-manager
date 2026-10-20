import { ProviderError } from "@deadlock-mods/common";
import {
  DeadworksRegistryResponseSchema,
  DeadworksSteamResponseSchema,
  normalizeDeadworksServers,
  type ServerBrowserEntry,
} from "@deadlock-mods/shared";
import type { z } from "zod";
import { logger } from "../lib/logger";

const REQUEST_TIMEOUT_MS = 8_000;

const fetchParsed = async <S extends z.ZodType>(
  endpoint: string,
  schema: S,
): Promise<z.output<S>> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ProviderError(
        `Deadworks API ${endpoint} responded with HTTP ${response.status}`,
      );
    }
    return schema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Steam's server list is the source of truth for which Deadworks servers are
 * up. The registry only enriches it, so losing the registry costs region flags
 * and versions rather than servers.
 */
export const fetchDeadworksServers = async (
  registryUrl: string,
): Promise<ServerBrowserEntry[]> => {
  const baseUrl = registryUrl.replace(/\/+$/, "");
  const [steamResult, registryResult] = await Promise.allSettled([
    fetchParsed(
      `${baseUrl}/api/steam/servers?deadworks=1`,
      DeadworksSteamResponseSchema,
    ),
    fetchParsed(`${baseUrl}/api/servers`, DeadworksRegistryResponseSchema),
  ]);

  if (steamResult.status === "rejected") throw steamResult.reason;
  if (registryResult.status === "rejected") {
    logger
      .withError(registryResult.reason)
      .warn("Deadworks registry unavailable; listing without enrichment");
  }

  return normalizeDeadworksServers(
    steamResult.value,
    registryResult.status === "fulfilled" ? registryResult.value : null,
    baseUrl,
    new Date(),
  );
};
