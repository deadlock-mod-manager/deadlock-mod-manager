import i18n from "@/lib/i18n";
import { HttpError } from "@/lib/http-error";

type Resource = "mods" | "profile" | "server" | "crosshair" | null;

const SPECIFIC_STATUS_CODES = new Set([403, 404]);

function classifyEndpoint(endpoint: string): Resource {
  if (endpoint.includes("/mods") || endpoint.includes("/vpk-analyse-hashes"))
    return "mods";
  if (endpoint.includes("/profiles")) return "profile";
  if (endpoint.includes("/servers") || endpoint.includes("/relays"))
    return "server";
  if (endpoint.includes("/crosshairs")) return "crosshair";
  return null;
}

function tx(prefix: string): { title: string; description: string } {
  return {
    title: i18n.t(`${prefix}.title`),
    description: i18n.t(`${prefix}.description`),
  };
}

export function formatUserError(error: unknown): {
  title: string;
  description: string;
} {
  if (!(error instanceof HttpError)) return tx("errors.http.generic");
  if (error.status === 0) return tx("errors.http.offline");
  if (error.status === 429) return tx("errors.http.429");

  if (error.source === "auth") {
    if (error.status >= 500) return tx("errors.http.auth.500");
    return tx("errors.http.auth.generic");
  }

  const resource = classifyEndpoint(error.endpoint);
  if (resource && SPECIFIC_STATUS_CODES.has(error.status)) {
    const specificKey = `errors.http.backend.${resource}.${error.status}`;
    if (i18n.exists(`${specificKey}.title`)) return tx(specificKey);
  }

  if (error.status === 503) return tx("errors.http.backend.503");
  if (error.status >= 500) return tx("errors.http.backend.500");
  return tx("errors.http.generic");
}
