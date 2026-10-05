import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deadlock-mods/ui/components/accordion";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { ExternalLink, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useHydrated } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  formatReleaseDate,
  formatReleaseDateTime,
  getReleaseUrl,
} from "@/lib/release-downloads";
import type { Release } from "@/types/releases";
import { PlatformDownloads } from "./platform-downloads";

const MAX_PRERELEASES = 5;

interface ReleaseListProps {
  releases: Release[];
  emptyMessage: string;
}

const ReleaseList = ({ releases, emptyMessage }: ReleaseListProps) => {
  // Relative times depend on the clock, so the server (and the hydration pass)
  // render the absolute date and the browser switches to "3 days ago" after.
  const hydrated = useHydrated();

  if (releases.length === 0) {
    return (
      <p className='rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm'>
        {emptyMessage}
      </p>
    );
  }

  return (
    <Accordion
      className='divide-y overflow-hidden rounded-xl border bg-card'
      collapsible
      type='single'>
      {releases.map((release) => (
        <AccordionItem
          className='border-b-0'
          key={release.version}
          value={release.version}>
          <AccordionTrigger className='items-center px-5 py-4 hover:bg-muted/40 hover:no-underline'>
            <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1'>
              <span className='truncate font-mono font-semibold text-sm'>
                {release.version}
              </span>
              {release.prerelease && (
                <Badge variant='outline'>Pre-release</Badge>
              )}
              <time
                className='text-muted-foreground text-xs'
                dateTime={release.publishedAt}
                title={formatReleaseDateTime(release.publishedAt)}>
                {hydrated
                  ? formatDistanceToNow(release.publishedAt, {
                      addSuffix: true,
                    })
                  : formatReleaseDate(release.publishedAt)}
              </time>
            </div>
          </AccordionTrigger>
          <AccordionContent className='px-5 pt-1 pb-5'>
            <PlatformDownloads
              downloads={release.downloads}
              version={release.version}
            />
            <a
              className='mt-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground'
              href={getReleaseUrl(release.version)}
              rel='noopener noreferrer'
              target='_blank'>
              <ExternalLink className='h-4 w-4' />
              View release on GitHub
            </a>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

interface ReleaseHistoryProps {
  releases: Release[];
  latestVersion: string;
}

export const ReleaseHistory = ({
  releases,
  latestVersion,
}: ReleaseHistoryProps) => {
  const previous = releases.filter(
    (release) => !release.prerelease && release.version !== latestVersion,
  );
  const prereleases = releases
    .filter((release) => release.prerelease)
    .slice(0, MAX_PRERELEASES);

  return (
    <section>
      <h2 className='mb-1 font-bold font-primary text-2xl'>Other versions</h2>
      <p className='mb-6 text-muted-foreground text-sm'>
        Roll back to an earlier release or try upcoming changes early.
      </p>

      <Tabs defaultValue='stable'>
        <TabsList className='mb-4'>
          <TabsTrigger value='stable'>Previous releases</TabsTrigger>
          <TabsTrigger value='prerelease'>Nightly builds</TabsTrigger>
        </TabsList>

        <TabsContent value='stable'>
          <ReleaseList
            emptyMessage='No previous releases yet.'
            releases={previous}
          />
        </TabsContent>

        <TabsContent className='space-y-4' value='prerelease'>
          <div className='flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>
            <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
            <p className='text-muted-foreground'>
              Nightly builds are made automatically from the latest code. They
              get new features first but may be unstable, so back up your mod
              setup before switching.
            </p>
          </div>
          <ReleaseList
            emptyMessage='No nightly builds available right now.'
            releases={prereleases}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
};
