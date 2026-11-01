import type { i18n } from "i18next";
import { z } from "zod";
import enTranslation from "@/locales/en.json" with { type: "json" };

const featuresSchema = z.array(z.string()).catch([]);
const highlightsSchema = z
  .array(z.object({ image: z.string(), caption: z.string() }))
  .catch([]);

export const getWhatsNewContent = (
  translations: Pick<i18n, "t" | "exists">,
  version: string,
) => {
  const titleKey = `whatsNew.versions.${version}.title`;
  const featuresKey = `whatsNew.versions.${version}.features`;
  const features = translations.exists(featuresKey, { fallbackLng: false })
    ? translations.t(featuresKey, { returnObjects: true, fallbackLng: false })
    : [];
  return {
    title: translations.exists(titleKey, { fallbackLng: false })
      ? translations.t(titleKey, { fallbackLng: false })
      : translations.t("whatsNew.title"),
    features: featuresSchema.parse(features),
    highlights: highlightsSchema.parse(
      translations.t(`whatsNew.versions.${version}.highlights`, {
        returnObjects: true,
      }),
    ),
  };
};

export const WHATS_NEW_RIBBON_VERSION_COUNT = 3;

const versionEntries: Record<
  string,
  { title: string; features: string[]; videoId?: string }
> = enTranslation.whatsNew.versions;

export const getWhatsNewVideoId = (version: string): string =>
  versionEntries[version]?.videoId ?? "";

/** Releases with notes between two versions, newest first, both ends excluded. */
export const getSkippedWhatsNewVersions = (
  from: string,
  to: string,
): string[] => {
  const versions = Object.keys(versionEntries);
  const start = versions.indexOf(to);
  const end = versions.indexOf(from);
  if (start === -1 || end <= start) return [];
  return versions.slice(start + 1, end);
};

export const getRecentWhatsNewVersions = (
  count = WHATS_NEW_RIBBON_VERSION_COUNT,
): string[] => {
  const versions = enTranslation.whatsNew?.versions;
  if (!versions) return [];
  return Object.keys(versions).slice(0, count);
};
