import { ProviderError } from "@deadlock-mods/common";
import {
  DeadworksRegistryResponseSchema,
  normalizeDeadworksRegistryServers,
  type ServerBrowserEntry,
} from "@deadlock-mods/shared";

export const fetchDeadworksRegistryServers = async (
  registryUrl: string,
): Promise<ServerBrowserEntry[]> => {
  const baseUrl = registryUrl.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/api/servers`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ProviderError(
        `Deadworks registry responded with HTTP ${response.status}`,
      );
    }

    const payload = DeadworksRegistryResponseSchema.parse(
      await response.json(),
    );
    return normalizeDeadworksRegistryServers(payload, baseUrl);
  } finally {
    clearTimeout(timeout);
  }
};
