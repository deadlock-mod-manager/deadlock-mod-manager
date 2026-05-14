import i18n from "@/lib/i18n";
import { HttpError } from "@/lib/http-error";

export type ErrorCategory =
  | "connection"
  | "server"
  | "rate-limit"
  | "auth"
  | "not-found"
  | "game-config"
  | "unknown";

type Resource = "mods" | "profile" | "server" | "crosshair" | null;

interface FormattedError {
  title: string;
  description: string;
  category: ErrorCategory;
}

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

function tx(prefix: string, category: ErrorCategory): FormattedError {
  return {
    title: i18n.t(`${prefix}.title`),
    description: i18n.t(`${prefix}.description`),
    category,
  };
}

function isGameConfigError(error: Error): boolean {
  return error.message.includes("Failed to parse game configuration");
}

export function formatUserError(error: unknown): FormattedError {
  if (error instanceof Error && isGameConfigError(error)) {
    return {
      title: i18n.t("errors.genericMessage"),
      description: "",
      category: "game-config",
    };
  }

  if (!(error instanceof HttpError))
    return tx("errors.http.generic", "unknown");
  if (error.status === 0) return tx("errors.http.offline", "connection");
  if (error.status === 429) return tx("errors.http.429", "rate-limit");

  if (error.source === "auth") {
    if (error.status >= 500) return tx("errors.http.auth.500", "auth");
    return tx("errors.http.auth.generic", "auth");
  }

  const resource = classifyEndpoint(error.endpoint);
  if (resource && SPECIFIC_STATUS_CODES.has(error.status)) {
    const specificKey = `errors.http.backend.${resource}.${error.status}`;
    if (i18n.exists(`${specificKey}.title`)) {
      const category = error.status === 404 ? "not-found" : "server";
      return tx(specificKey, category);
    }
  }

  if (error.status === 503) return tx("errors.http.backend.503", "server");
  if (error.status >= 500) return tx("errors.http.backend.500", "server");
  return tx("errors.http.generic", "unknown");
}
