import type { ServerBrowserEntry } from "@deadlock-mods/shared";

/**
 * Deadworks servers never populate `required_mods` — their maps and addons
 * hang off a per-server content manifest on the registry that listed them.
 * Returns the registry base URL to ask, or null for servers that use the
 * regular relay mod requirements.
 */
export const deadworksRegistryFor = (
  server: ServerBrowserEntry,
): string | null => {
  const source = server.source_relay?.trim();
  if (!source || !source.startsWith("https://")) return null;

  try {
    const { hostname } = new URL(source);
    const isDeadworks =
      hostname === "deadworks.net" || hostname.endsWith(".deadworks.net");
    return isDeadworks ? source.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
};
