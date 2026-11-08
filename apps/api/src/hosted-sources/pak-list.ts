import { posix } from "node:path";
import type { HostedSourceSnapshot } from "./types";

/**
 * `pak01_dir.vpk  HUD++  (hud.vpk)`: a pak name, then its label after two or
 * more spaces, optionally followed by the original file name in parentheses.
 * Lines that don't start with a VPK name are prose and are skipped.
 */
const PAK_LINE = /^(\S+\.vpk)\s{2,}(.+?)(?:\s{2,}\([^)]*\))?\s*$/i;

/** Labels for the VPKs next to a pak-list file, keyed by archive path. */
export const parsePakList = (
  listPath: string,
  text: string,
): HostedSourceSnapshot["labels"] => {
  const folder = posix.dirname(listPath);
  const labels: HostedSourceSnapshot["labels"] = {};
  for (const line of text.split(/\r?\n/)) {
    const match = PAK_LINE.exec(line.trim());
    if (match?.[1] && match[2]) {
      labels[posix.join(folder, match[1])] = match[2];
    }
  }
  return labels;
};
