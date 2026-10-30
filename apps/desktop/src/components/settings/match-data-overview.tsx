import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowUpRight } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { TRACKER_SITES, type TrackerSite } from "@/lib/tracker-sites";

const TILE_CLASS =
  "grid size-9 place-items-center rounded-md border border-border/50 bg-muted/40";

const DEADLOCK_API_URL = "https://deadlock-api.com";

const DeadlockApiLink = ({ children }: { children?: React.ReactNode }) => (
  <button
    className='mx-0.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 py-0.5 pr-1.5 pl-1 align-middle text-foreground transition-colors hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    onClick={() => openUrl(DEADLOCK_API_URL)}
    type='button'>
    <img
      alt=''
      className='size-4'
      height={16}
      src='/brand/deadlock-api.svg'
      width={16}
    />
    {children}
    <ArrowUpRight className='size-3.5 text-muted-foreground' />
  </button>
);

const TrackerIcon = ({ site }: { site: TrackerSite }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className='font-semibold text-muted-foreground text-xs'>
        {site.name.charAt(0)}
      </span>
    );
  }

  return (
    <img
      alt={site.name}
      className='size-6 object-contain'
      decoding='async'
      height={24}
      loading='lazy'
      onError={() => setFailed(true)}
      referrerPolicy='no-referrer'
      src={site.icon}
      width={24}
    />
  );
};

const TrackerTile = ({ site }: { site: TrackerSite }) => {
  const { href } = site;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <button
            className={`${TILE_CLASS} transition-colors hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            onClick={() => openUrl(href)}
            type='button'>
            <TrackerIcon site={site} />
          </button>
        ) : (
          <span className={TILE_CLASS}>
            <TrackerIcon site={site} />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className='flex items-center gap-1'>
        {site.name}
        {href && <ArrowUpRight className='size-3.5' />}
      </TooltipContent>
    </Tooltip>
  );
};

export const MatchDataOverview = () => {
  const { t } = useTranslation();

  return (
    <div className='space-y-2 text-muted-foreground text-sm'>
      <p className='font-medium text-foreground'>
        {t("matchSync.overview.powersTitle")}
      </p>
      <ul className='list-disc space-y-1 pl-5'>
        <li>
          <Trans
            components={{ api: <DeadlockApiLink /> }}
            count={TRACKER_SITES.length}
            i18nKey='matchSync.overview.trackers'
          />
          <span className='mt-2 mb-1 flex flex-wrap gap-1.5'>
            {TRACKER_SITES.map((site) => (
              <TrackerTile key={site.name} site={site} />
            ))}
          </span>
          <span className='block text-muted-foreground/70 text-xs'>
            {t("matchSync.overview.trackersSource")}
          </span>
        </li>
        <li>{t("matchSync.overview.stats")}</li>
        <li>{t("matchSync.overview.everyone")}</li>
      </ul>
      <p>{t("matchSync.overview.sends")}</p>
    </div>
  );
};
