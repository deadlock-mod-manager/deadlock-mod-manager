import { BookOpen, ExternalLink } from "@deadlock-mods/ui/icons";
import { DOCS_URL } from "@/lib/constants";
import { formatReleaseDate, getReleaseUrl } from "@/lib/release-downloads";
import type { DetectedOS, Release } from "@/types/releases";
import { PlatformDownloads } from "./platform-downloads";

interface LatestReleaseProps {
  release: Release;
  userOS: DetectedOS;
}

export const LatestRelease = ({ release, userOS }: LatestReleaseProps) => (
  <section className='scroll-mt-24' id='platforms'>
    <div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
      <div>
        <h2 className='font-bold font-primary text-2xl'>
          Choose your platform
        </h2>
        <p className='mt-1 text-muted-foreground text-sm'>
          Version {release.version}, released{" "}
          {formatReleaseDate(release.publishedAt)}
        </p>
      </div>
      <div className='flex items-center gap-4 text-sm'>
        <a
          className='inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground'
          href={`${DOCS_URL}/using-mod-manager/installation`}
          rel='noopener noreferrer'
          target='_blank'>
          <BookOpen className='h-4 w-4' />
          Install guide
        </a>
        <a
          className='inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground'
          href={getReleaseUrl(release.version)}
          rel='noopener noreferrer'
          target='_blank'>
          <ExternalLink className='h-4 w-4' />
          Release notes
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
