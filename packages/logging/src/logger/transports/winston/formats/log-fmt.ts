/** biome-ignore-all lint/performance/noDelete: don't care lmao */
import logfmt from 'logfmt';
import { format } from 'winston';
import { formatLogComponents } from '../utils';

/**
 * Format for development environments with colorized output
 *
 * Example:
 * 2025-03-17T15:37:13+01:00 app-api (1.0.0) [error]: Test error app=app-api
 */
export const devFormat = format.combine(
  format.timestamp({ format: 'isoDateTime' }),
  format.colorize(),
  format.align(),
  format.printf(({ level, message, timestamp, error, ...meta }) => {
    // Track seen keys to avoid duplicates
    const seenKeys = new Set<string>();

    // Extract app and version before processing splat to avoid duplicates
    const app = meta?.app ?? '';
    if (app) seenKeys.add('app');

    const version = meta?.version ? `(${meta?.version})` : '';
    if (meta?.version) seenKeys.add('version');

    // Remove app and version from meta to avoid duplicates
    const metadata = { ...meta };

    delete metadata.app;
    delete metadata.version;
    delete metadata[Symbol.for('splat')];

    const { formattedMessage, formattedMetadata, formattedError } =
      formatLogComponents({
        message,
        meta: metadata,
        error,
        seenKeys,
      });

    const splat = formatSplat(meta[Symbol.for('splat')], seenKeys);

    return [
      timestamp,
      app,
      version,
      `[${level}]:`,
      formattedMessage,
      splat,
      formattedMetadata,
      formattedError,
    ].join(' ');
  })
);

/**
 * Format splat array for dev format
 */
export const formatSplat = (
  splat: unknown,
  seenKeys: Set<string> = new Set()
): string => {
  if (!Array.isArray(splat)) {
    return splat ? String(splat) : '';
  }

  const result = splat
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return String(item);
      }

      // For objects, check for duplicate keys
      const filteredObj = Object.entries(
        item as Record<string, unknown>
      ).reduce(
        (acc, [key, value]) => {
          if (!seenKeys.has(key) && key !== 'error') {
            seenKeys.add(key);
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, unknown>
      );

      return Object.keys(filteredObj).length > 0
        ? logfmt.stringify(filteredObj)
        : '';
    })
    .filter((str) => str.length > 0)
    .join(' ');

  return result;
};
