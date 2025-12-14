import chalk from "chalk";
import logfmt from "logfmt";
import { format } from "winston";
import { formatLogComponents } from "../utils";

/**
 * Format for development environments with colorized output
 *
 * Example:
 * 2025-03-17T15:37:13+01:00 app-api (1.0.0) [error]: Test error app=app-api
 */
export const devFormat = format.combine(
  format.timestamp({ format: "HH:mm:ss" }),
  format.colorize(),
  format.align(),
  format.printf(({ level, message, timestamp, error, ...meta }) => {
    // Track seen keys to avoid duplicates
    const seenKeys = new Set<string>();

    // Extract app and version before processing splat to avoid duplicates
    const app = (meta?.["app"] ?? "") as string;
    if (app) seenKeys.add("app");

    const service = (meta?.["service"] ?? "") as string;
    if (service) seenKeys.add("service");

    if (meta?.["version"]) seenKeys.add("version");

    // Remove app and version from meta to avoid duplicates
    const metadata = { ...meta };

    delete metadata["app"];
    delete metadata["version"];
    delete metadata["service"];
    delete metadata[Symbol.for("splat")];

    const { formattedMessage, formattedMetadata, formattedError } =
      formatLogComponents({
        message,
        meta: metadata,
        error,
        seenKeys,
      });

    const splat = formatSplat(meta[Symbol.for("splat")], seenKeys);
    const version = (meta?.["version"] ?? "") as string;
    const parts = [
      timestamp,
      `[${level}]`,
      `${app}${version ? `@${version}` : ""}`,
      chalk.cyan(service || "*") + ":",
      formattedMessage.trim(),
      splat?.trim() ? chalk.gray(splat?.trim()) : null,
      formattedMetadata?.trim() ? chalk.gray(formattedMetadata?.trim()) : null,
      formattedError?.trim()
        ? level.includes("warn")
          ? chalk.yellow(formattedError?.trim())
          : chalk.red(formattedError?.trim())
        : null,
    ].filter(Boolean);

    return parts.join(" ");
  }),
);

/**
 * Format splat array for dev format
 */
export const formatSplat = (
  splat: unknown,
  seenKeys: Set<string> = new Set(),
): string => {
  if (!Array.isArray(splat)) {
    if (!splat) return "";
    if (typeof splat === "object") {
      return JSON.stringify(splat, null, 2);
    }
    return String(splat);
  }

  const result = splat
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return String(item);
      }

      // For objects, check for duplicate keys
      const filteredObj = Object.entries(
        item as Record<string, unknown>,
      ).reduce(
        (acc, [key, value]) => {
          if (!seenKeys.has(key) && key !== "error") {
            seenKeys.add(key);
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

      if (Object.keys(filteredObj).length > 0) {
        try {
          const logfmtResult = logfmt.stringify(filteredObj);
          if (logfmtResult.includes("[object Object]")) {
            return JSON.stringify(filteredObj, null, 2);
          }
          return logfmtResult;
        } catch {
          return JSON.stringify(filteredObj, null, 2);
        }
      }
      return "";
    })
    .filter((str) => str.length > 0)
    .join(" ");

  return result;
};
