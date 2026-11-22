import { join } from "node:path";

const BACKSLASHES = /\\/g;
const LEADING_SLASHES = /^\/+/;
const DOT_RUNS = /\.\.+/g;

export const fileExtension = (filePath: string): string => {
  const lastDot = filePath.lastIndexOf(".");
  return lastDot === -1 ? "" : filePath.slice(lastDot).toLowerCase();
};

export const matchesExtensions = (
  filePath: string,
  extensions: string[] | undefined,
): boolean =>
  !extensions?.length || extensions.includes(fileExtension(filePath));

export const toSafeRelativePath = (entryPath: string): string =>
  entryPath
    .replace(BACKSLASHES, "/")
    .replace(LEADING_SLASHES, "")
    .replace(DOT_RUNS, "");

export const toSafeTargetPath = (targetDir: string, entryPath: string) =>
  join(targetDir, toSafeRelativePath(entryPath));
