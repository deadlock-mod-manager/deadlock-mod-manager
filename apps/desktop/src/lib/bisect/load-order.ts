import type { VpkManifest, VpkManifestEntry } from "@/types/profiles";

const PAK_NUMBER = /^pak(\d+)_dir\.vpk$/i;

const firstPak = (entry: VpkManifestEntry) =>
  Math.min(
    ...entry.currentVpks.map((name) => {
      const match = PAK_NUMBER.exec(name);
      return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    }),
  );

export const loadOrderOf = (manifest: VpkManifest): string[] =>
  Object.entries(manifest.mods)
    .filter(([, entry]) => entry.enabled && entry.currentVpks.length > 0)
    .sort(([, a], [, b]) => a.shard - b.shard || firstPak(a) - firstPak(b))
    .map(([id]) => id);

export const sortByLoadOrder = (ids: string[], loadOrder: string[]) => {
  const position = new Map(loadOrder.map((id, index) => [id, index]));
  const rank = (id: string) => position.get(id) ?? loadOrder.length;
  return [...ids].sort((a, b) => rank(a) - rank(b));
};
