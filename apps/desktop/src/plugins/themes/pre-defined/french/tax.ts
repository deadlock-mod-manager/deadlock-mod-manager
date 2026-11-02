import { type LocalMod, ModStatus } from "@/types/mods";

export const FRENCH_TAX_RATE = 0.055;
const BYTES_PER_GIGABYTE = 1_000_000_000;

/** Estimate bandwidth tax from completed, selected archives, excluding unchosen variants. */
export function calculateFrenchTax(
  mods: readonly Pick<LocalMod, "status" | "selectedDownloads">[],
) {
  let totalBytes = 0;
  let missingSizes = 0;

  for (const mod of mods) {
    if (
      mod.status !== ModStatus.Downloaded &&
      mod.status !== ModStatus.Installed
    ) {
      continue;
    }

    const files = mod.selectedDownloads ?? [];
    if (files.length === 0 || files.some((file) => file.size <= 0)) {
      missingSizes += 1;
    }
    for (const file of files) {
      if (file.size > 0) totalBytes += file.size;
    }
  }

  const gigabytes = totalBytes / BYTES_PER_GIGABYTE;
  return {
    totalBytes,
    gigabytes,
    taxEuro: gigabytes * FRENCH_TAX_RATE,
    missingSizes,
  };
}
