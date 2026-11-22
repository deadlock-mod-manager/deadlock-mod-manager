import type winston from "winston";
import { format } from "winston";

const formatMeta = (meta: Record<string | symbol, unknown | unknown[]>) => {
  // Exclude Winston splat numeric indices (0, 1, ...) from metadata; keep named fields
  return Object.entries(meta).reduce(
    (acc, [key, value]) => {
      if (Number.isNaN(Number(key)) && typeof key !== "symbol") {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );
};

const customFormat = format.printf((info) => {
  const { level, message, timestamp, ...meta } = info;

  // Handle string array that Winston splits into numeric properties
  const stringParts = Object.entries(info)
    .filter(([key]) => !Number.isNaN(Number(key)))
    .map(([, value]) => value);

  const fullMessage = stringParts
    ? [message, " ", ...stringParts].join("")
    : message;

  return JSON.stringify({
    level,
    message: fullMessage,
    timestamp,
    ...formatMeta(meta),
  });
});

export const prodFormat: winston.Logform.Format = format.combine(
  format.timestamp({ format: "isoDateTime" }),
  format.splat(),
  customFormat,
);
