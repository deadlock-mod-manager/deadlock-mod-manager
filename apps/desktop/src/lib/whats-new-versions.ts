import enTranslation from "@/locales/en.json" with { type: "json" };

export const WHATS_NEW_RIBBON_VERSION_COUNT = 3;

const versionEntries: Record<
  string,
  { title: string; features: string[]; videoId?: string }
> = enTranslation.whatsNew.versions;

export const getWhatsNewVideoId = (version: string): string =>
  versionEntries[version]?.videoId ?? "";

export const getRecentWhatsNewVersions = (
  count = WHATS_NEW_RIBBON_VERSION_COUNT,
): string[] => {
  const versions = enTranslation.whatsNew?.versions;
  if (!versions) return [];
  return Object.keys(versions).slice(0, count);
};
