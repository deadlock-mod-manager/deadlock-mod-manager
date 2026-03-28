import chalk from "chalk";
import logfmt from "logfmt";
import { format } from "winston";
import type { FormattedError } from "../utils";
import { formatLogComponents } from "../utils";

const LEVEL_BADGES: Record<string, string> = {
  error: chalk.red.bold("ERROR"),
  warn: chalk.yellow.bold("WARN"),
  info: chalk.green.bold("INFO"),
  debug: chalk.blue.bold("DEBUG"),
  trace: chalk.gray("TRACE"),
  fatal: chalk.bgRed.white.bold("FATAL"),
};

const INDENT = "         ";

function getLevelBadge(level: string): string {
  for (const [key, badge] of Object.entries(LEVEL_BADGES)) {
    if (level.includes(key)) return badge;
  }
  return level;
}

function formatMetadataLine(kvString: string): string {
  if (!kvString) return "";
  return kvString
    .split(" ")
    .map((pair) => {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) return chalk.dim(pair);
      const key = pair.slice(0, eqIdx);
      const value = pair.slice(eqIdx + 1);
      return `${chalk.dim(key)}${chalk.dim("=")}${chalk.white(value)}`;
    })
    .join(" ");
}

function formatErrorBlock(error: FormattedError, isWarning: boolean): string[] {
  const lines: string[] = [];
  const headlineColor = isWarning ? chalk.yellow : chalk.red;
  lines.push(`${INDENT}${headlineColor(error.headline)}`);
  for (const stackLine of error.stackLines) {
    lines.push(`${INDENT}${chalk.dim(stackLine)}`);
  }
  return lines;
}

export const devFormat = format.combine(
  format.timestamp({ format: "HH:mm:ss" }),
  format.printf(({ level, message, timestamp, error, ...meta }) => {
    const seenKeys = new Set<string>();

    const app = (meta?.app ?? "") as string;
    if (app) seenKeys.add("app");

    const service = (meta?.service ?? "") as string;
    if (service) seenKeys.add("service");

    if (meta?.version) seenKeys.add("version");

    const metadata = { ...meta };
    delete metadata.app;
    delete metadata.version;
    delete metadata.service;
    delete metadata.environment;
    delete metadata[Symbol.for("splat")];

    const { formattedMessage, formattedMetadata, formattedError } =
      formatLogComponents({
        message,
        meta: metadata,
        error,
        seenKeys,
      });

    const splat = formatSplat(meta[Symbol.for("splat")], seenKeys);
    const version = (meta?.version ?? "") as string;
    const badge = getLevelBadge(level);
    const isWarning = level.includes("warn");

    const appLabel = app
      ? chalk.dim(`${app}${version ? `@${version}` : ""}`)
      : "";

    const serviceLabel = service ? chalk.cyan.bold(service) : "";

    const prefix = [appLabel, serviceLabel].filter(Boolean).join(" ");

    const mainLine = [
      chalk.dim(timestamp),
      badge,
      prefix ? `${prefix}${chalk.dim(":")}` : null,
      formattedMessage.trim(),
    ]
      .filter(Boolean)
      .join(" ");

    const lines: string[] = [mainLine];

    const allMeta = [splat?.trim(), formattedMetadata?.trim()]
      .filter(Boolean)
      .join(" ");

    if (allMeta) {
      lines.push(`${INDENT}${formatMetadataLine(allMeta)}`);
    }

    if (formattedError) {
      lines.push(...formatErrorBlock(formattedError, isWarning));
    }

    return lines.join("\n");
  }),
);

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
