import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowDown, Check, ExternalLink } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { getReleaseUrl } from "@/lib/release-downloads";
import type { Release } from "@/types/releases";
import Logo from "../logo";
import { PlatformDownloadButton } from "./platform-download-button";

const HIGHLIGHTS = ["openSource", "autoUpdate", "platforms"] as const;

interface DownloadsHeroProps {
  latest: Release;
}

export const DownloadsHero = ({ latest }: DownloadsHeroProps) => {
  const { t } = useTranslation("download");

  return (
    <div className='border-b bg-gradient-to-b from-background to-muted/20'>
      <div className='container mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-24'>
        <Logo className='h-16 w-16' />

        <a
          className='mt-8 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary text-sm ring-1 ring-primary/20 ring-inset transition-colors hover:bg-primary/15'
          href={getReleaseUrl(latest.version)}
          rel='noopener noreferrer'
          target='_blank'>
          v{latest.version}
          <span className='font-medium text-muted-foreground'>
            {t("hero.whatsNew")}
          </span>
          <ExternalLink className='h-3.5 w-3.5 text-muted-foreground' />
        </a>

        <h1 className='mt-6 text-balance font-bold font-primary text-4xl tracking-tight sm:text-5xl'>
          {t("hero.title")}
        </h1>
        <p className='mt-4 text-pretty text-lg text-muted-foreground'>
          {t("hero.description")}
        </p>

        <div className='mt-10 flex flex-col items-center gap-3 sm:flex-row sm:items-start'>
          <PlatformDownloadButton className='min-w-60' showVersionInfo />
          <Button asChild size='lg' variant='ghost'>
            <a href='#platforms'>
              {t("hero.otherPlatforms")}
              <ArrowDown className='h-4 w-4' />
            </a>
          </Button>
        </div>

        <ul className='mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-muted-foreground text-sm'>
          {HIGHLIGHTS.map((highlight) => (
            <li className='flex items-center gap-1.5' key={highlight}>
              <Check className='h-4 w-4 text-primary' />
              {t(`hero.highlights.${highlight}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
