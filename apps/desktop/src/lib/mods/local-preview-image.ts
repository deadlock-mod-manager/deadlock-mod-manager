import type { LocalMod } from "@/types/mods";

export const needsLocalThumbnail = (
  mod: Pick<LocalMod, "remoteId" | "images" | "isAudio">,
): boolean => {
  if (!mod.remoteId.startsWith("local-") || mod.isAudio) return false;
  if (mod.images.length === 0) return true;
  return mod.images.every((image) => {
    if (!image.startsWith("data:image/svg+xml")) return false;
    const comma = image.indexOf(",");
    if (comma < 0) return false;
    try {
      const metadata = image.slice(0, comma);
      const data = image.slice(comma + 1);
      const svg = metadata.split(";").includes("base64")
        ? atob(data)
        : decodeURIComponent(data);
      return (
        svg.includes("Geist Variable, Arial, sans-serif") &&
        svg.includes(">No image provided</text>")
      );
    } catch {
      return false;
    }
  });
};
