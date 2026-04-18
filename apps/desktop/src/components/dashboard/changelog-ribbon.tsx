import { ArrowRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { GITHUB_REPO } from "@/lib/constants";
import { cn } from "@/lib/utils";

const RECENT_VERSIONS = ["0.18.0", "0.17.0", "0.16.0"] as const;
const MAX_VISIBLE_FEATURES = 3;

type VersionEntry = {
  version: string;
  title: string;
  features: string[];
};

const useRecentReleases = (): VersionEntry[] => {
  const { t } = useTranslation();

  return RECENT_VERSIONS.map((version) => {
    const features = t(`whatsNew.versions.${version}.features`, {
      returnObjects: true,
      defaultValue: [],
    });
    const featuresArray = Array.isArray(features)
      ? features.filter((f): f is string => typeof f === "string")
      : [];

    return {
      version,
      title: t(`whatsNew.versions.${version}.title`),
      features: featuresArray,
    };
  });
};

const VersionColumn = ({
  entry,
  isFirst,
}: {
  entry: VersionEntry;
  isFirst: boolean;
}) => {
  const { t } = useTranslation();
  const visible = entry.features.slice(0, MAX_VISIBLE_FEATURES);
  const hidden = Math.max(entry.features.length - MAX_VISIBLE_FEATURES, 0);

  return (
    <div
      className={cn(
        "group/col relative flex min-w-0 flex-1 flex-col gap-3 px-6 py-4",
        !isFirst && "lg:border-primary/15 lg:border-l",
      )}>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute top-0 left-0 size-3 border-primary/0 border-t border-l opacity-0 transition-all duration-300 group-hover/col:border-primary/40 group-hover/col:opacity-100'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute top-0 right-0 size-3 border-primary/0 border-t border-r opacity-0 transition-all duration-300 group-hover/col:border-primary/40 group-hover/col:opacity-100'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute bottom-0 left-0 size-3 border-primary/0 border-b border-l opacity-0 transition-all duration-300 group-hover/col:border-primary/40 group-hover/col:opacity-100'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute right-0 bottom-0 size-3 border-primary/0 border-r border-b opacity-0 transition-all duration-300 group-hover/col:border-primary/40 group-hover/col:opacity-100'
      />

      <div className='flex items-baseline gap-3'>
        <span
          className='font-bold text-3xl text-foreground leading-none tracking-tight'
          style={{ fontFamily: '"Forevs Demo", serif' }}>
          v{entry.version}
        </span>
      </div>

      <p className='font-medium text-foreground/90 text-sm leading-snug'>
        {entry.title}
      </p>

      <ul className='space-y-1.5'>
        {visible.map((feature) => (
          <li
            className='flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'
            key={feature}>
            <span
              aria-hidden='true'
              className='mt-1 inline-block size-1 shrink-0 rounded-full bg-primary/50'
            />
            <span className='line-clamp-2'>{feature}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          className='mt-auto self-start font-medium text-[10px] text-primary/80 uppercase tracking-[0.2em] transition-colors hover:text-primary'
          onClick={() =>
            openUrl(`${GITHUB_REPO}/releases/tag/v${entry.version}`)
          }
          type='button'>
          {t("dashboard.moreFeatures", { count: hidden })}
        </button>
      )}
    </div>
  );
};

export const ChangelogRibbon = () => {
  const { t } = useTranslation();
  const releases = useRecentReleases();

  return (
    <section className='relative w-full'>
      <header className='mb-3 flex items-center justify-between border-primary/20 border-b pb-2'>
        <div className='flex items-center gap-2'>
          <SparkleIcon className='size-4 text-primary' weight='duotone' />
          <span
            className='font-bold text-[11px] text-primary uppercase tracking-[0.4em]'
            style={{ fontFamily: '"Forevs Demo", serif' }}>
            {t("dashboard.changelog")}
          </span>
        </div>
        <button
          className='group flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-[0.25em] transition-colors hover:text-primary'
          onClick={() => openUrl(`${GITHUB_REPO}/releases`)}
          type='button'>
          {t("whatsNew.fullReleaseNotes")}
          <ArrowRightIcon
            className='size-3 transition-transform group-hover:translate-x-0.5'
            weight='bold'
          />
        </button>
      </header>

      <div className='grid grid-cols-1 lg:grid-cols-3'>
        {releases.map((entry, idx) => (
          <VersionColumn
            entry={entry}
            isFirst={idx === 0}
            key={entry.version}
          />
        ))}
      </div>
    </section>
  );
};
