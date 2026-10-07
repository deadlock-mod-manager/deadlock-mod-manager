import { BookOpen, ExternalLink } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DOCS_URL } from "@/lib/constants";
import { getReleaseUrl } from "@/lib/release-downloads";
import type { DetectedOS, Release } from "@/types/releases";
import { PlatformDownloads } from "./platform-downloads";
import { useReleaseDates } from "./use-release-dates";

interface LatestReleaseProps {
  release: Release;
  userOS: DetectedOS;
}

export const LatestRelease = ({ release, userOS }: LatestReleaseProps) => {
  const { t } = useTranslation("download");
  const { formatDate } = useReleaseDates();

  return (
    <section className='scroll-mt-24' id='platforms'>
      <div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 className='font-bold font-primary text-2xl'>
            {t("latest.title")}
          </h2>
          <p className='mt-1 text-muted-foreground text-sm'>
            {t("latest.released", {
              version: release.version,
              date: formatDate(release.publishedAt),
            })}
          </p>
        </div>
        <div className='flex items-center gap-4 text-sm'>
          <a
            className='inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground'
            href={`${DOCS_URL}/using-mod-manager/installation`}
            rel='noopener noreferrer'
            target='_blank'>
            <BookOpen className='h-4 w-4' />
            {t("latest.installGuide")}
          </a>
          <a
            className='inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground'
            href={getReleaseUrl(release.version)}
            rel='noopener noreferrer'
            target='_blank'>
            <ExternalLink className='h-4 w-4' />
            {t("latest.releaseNotes")}
          </a>
        </div>
      </div>

      <PlatformDownloads
        downloads={release.downloads}
        userOS={userOS}
        version={release.version}
      />
    </section>
  );
};
