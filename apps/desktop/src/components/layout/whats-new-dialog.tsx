import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  FloppyDiskIcon,
  GlobeIcon,
  PaintBrushIcon,
  PlayIcon,
  PlusIcon,
  SparkleIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useAbout from "@/hooks/use-about";
import { getLastSeenVersion } from "@/hooks/use-whats-new";
import { getReleaseNotesUrl } from "@/lib/app-version-display";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  getSkippedWhatsNewVersions,
  getWhatsNewContent,
  getWhatsNewVideoId,
} from "@/lib/whats-new-versions";

type WhatsNewDialogProps = {
  onClose: () => void;
};

type FeatureCategory = {
  key: string;
  labelKey: string;
  icon: ReactNode;
  features: string[];
};

const EMOJI_TO_CATEGORY: Record<
  string,
  { key: string; labelKey: string; icon: ReactNode }
> = {
  "\u2728": {
    key: "new",
    labelKey: "whatsNew.categories.new",
    icon: <SparkleIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83D\uDCE6": {
    key: "improvements",
    labelKey: "whatsNew.categories.improvements",
    icon: <FloppyDiskIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83C\uDFA8": {
    key: "design",
    labelKey: "whatsNew.categories.design",
    icon: <PaintBrushIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83D\uDD27": {
    key: "fixes",
    labelKey: "whatsNew.categories.fixes",
    icon: <WrenchIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83C\uDF10": {
    key: "i18n",
    labelKey: "whatsNew.categories.i18n",
    icon: <GlobeIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83D\uDCE5": {
    key: "downloads",
    labelKey: "whatsNew.categories.downloads",
    icon: <PlusIcon className='size-3.5' weight='duotone' />,
  },
  "\uD83E\uDDEA": {
    key: "experimental",
    labelKey: "whatsNew.categories.experimental",
    icon: <SparkleIcon className='size-3.5' weight='duotone' />,
  },
};

const EMOJI_PATTERN = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u;

const stripEmoji = (text: string): string => text.replace(EMOJI_PATTERN, "");

const getEmojiPrefix = (text: string): string | null => {
  const match = text.match(EMOJI_PATTERN);
  return match ? match[0].trim() : null;
};

const categorizeFeatures = (features: string[]): FeatureCategory[] => {
  const categoryMap = new Map<string, FeatureCategory>();

  for (const feature of features) {
    const emoji = getEmojiPrefix(feature);
    const mapping = emoji ? EMOJI_TO_CATEGORY[emoji] : undefined;
    const categoryKey = mapping?.key ?? "other";

    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        key: categoryKey,
        labelKey: mapping?.labelKey ?? "whatsNew.categories.other",
        icon: mapping?.icon ?? (
          <WrenchIcon className='size-3.5' weight='duotone' />
        ),
        features: [],
      });
    }
    categoryMap.get(categoryKey)?.features.push(stripEmoji(feature));
  }

  const order = [
    "new",
    "improvements",
    "downloads",
    "design",
    "experimental",
    "fixes",
    "i18n",
    "other",
  ];
  return order.flatMap((key) => {
    const category = categoryMap.get(key);
    return category ? [category] : [];
  });
};

const CategorySection = ({
  category,
  categoryIndex,
  t,
}: {
  category: FeatureCategory;
  categoryIndex: number;
  t: (key: string) => string;
}) => {
  const baseDelay = categoryIndex * 60;

  return (
    <div
      className='wn-category-enter space-y-2'
      style={{ animationDelay: `${baseDelay}ms` }}>
      <div className='flex items-center gap-2 text-primary'>
        {category.icon}
        <span className='font-semibold text-xs uppercase tracking-widest'>
          {t(category.labelKey)}
        </span>
        <Badge
          className='ml-auto h-4 min-w-5 justify-center rounded-full px-1.5 font-mono text-[10px]'
          variant='outline'>
          {category.features.length}
        </Badge>
      </div>
      <ul className='space-y-1 pl-5'>
        {category.features.map((feature, featureIndex) => (
          <li
            className='wn-feature-enter flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'
            key={feature}
            style={{ animationDelay: `${baseDelay + featureIndex * 25}ms` }}>
            <span
              aria-hidden='true'
              className='mt-[5px] inline-block size-1 shrink-0 rounded-full bg-primary/40'
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const YouTubeEmbed = ({ videoId }: { videoId: string }) => {
  const { t } = useTranslation();
  const [activated, setActivated] = useState(false);

  if (!videoId) return null;

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div className='wn-title-enter px-6 pt-5'>
      <div className='relative overflow-hidden rounded-lg border border-primary/15'>
        {activated ? (
          <div className='aspect-video'>
            <iframe
              allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
              allowFullScreen
              className='size-full'
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
              title={t("whatsNew.video.embedTitle")}
            />
          </div>
        ) : (
          <button
            className='group relative block aspect-video w-full cursor-pointer'
            onClick={() => setActivated(true)}
            type='button'>
            <img
              alt={t("whatsNew.video.thumbnailAlt")}
              className='size-full object-cover'
              src={thumbnailUrl}
            />
            <div className='absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40' />
            <div className='absolute inset-0 flex items-center justify-center'>
              <div className='flex size-14 items-center justify-center rounded-full bg-primary/90 shadow-lg transition-transform group-hover:scale-110'>
                <PlayIcon
                  className='ml-0.5 size-7 text-primary-foreground'
                  weight='fill'
                />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

const MAX_SKIPPED_LINKS = 4;

const Highlights = ({
  highlights,
}: {
  highlights: { image: string; caption: string }[];
}) => {
  const { t } = useTranslation();

  return (
    <div className='wn-title-enter space-y-3 px-6 pt-5'>
      {highlights.map(({ image, caption }) => (
        <figure
          className='overflow-hidden rounded-lg border border-primary/15'
          key={image}>
          <img
            alt={t("whatsNew.highlightAlt", { caption })}
            className='block w-full'
            src={image}
          />
          <figcaption className='border-primary/15 border-t bg-primary/[0.04] px-3 py-2 font-semibold text-foreground text-xs'>
            {caption}
          </figcaption>
        </figure>
      ))}
    </div>
  );
};

const VersionBadge = ({ from, to }: { from: string | null; to: string }) => (
  <Badge
    className='ml-auto gap-1.5 rounded-md border-primary/20 bg-primary/[0.07] font-mono text-primary/80 text-[10px] tabular-nums'
    variant='outline'>
    {from && (
      <>
        <span className='wn-version-from'>v{from}</span>
        <ArrowRightIcon
          aria-hidden='true'
          className='wn-version-arrow size-2.5'
        />
      </>
    )}
    <span className={from ? "wn-version-to" : undefined}>v{to}</span>
  </Badge>
);

const SkippedReleases = ({
  from,
  versions,
}: {
  from: string;
  versions: string[];
}) => {
  const { t } = useTranslation();
  const hidden = versions.length - MAX_SKIPPED_LINKS;

  return (
    <div className='relative mt-3 flex flex-wrap items-center gap-1.5'>
      <span className='text-muted-foreground text-xs'>
        {t("whatsNew.skippedSince", { version: from })}
      </span>
      {versions.slice(0, MAX_SKIPPED_LINKS).map((skipped) => (
        <button
          aria-label={t("whatsNew.skippedReleaseNotes", { version: skipped })}
          className='inline-flex items-center gap-1 rounded-md border border-primary/20 px-1.5 py-0.5 font-mono text-[11px] text-primary/80 tabular-nums transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'
          key={skipped}
          onClick={() => openUrl(getReleaseNotesUrl(skipped))}
          type='button'>
          {skipped}
          <ArrowSquareOutIcon aria-hidden='true' className='size-3' />
        </button>
      ))}
      {hidden > 0 && (
        <span className='text-muted-foreground text-xs'>
          {t("whatsNew.skippedMore", { count: hidden })}
        </span>
      )}
    </div>
  );
};

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { t, i18n } = useTranslation();
  const { data } = useAbout();

  const version = data?.version || "0.10.0";

  const videoId = getWhatsNewVideoId(version);
  // Read once: closing the dialog marks this version as seen.
  const [lastSeen] = useState(getLastSeenVersion);
  const from = lastSeen && lastSeen !== version ? lastSeen : null;
  const skipped = from ? getSkippedWhatsNewVersions(from, version) : [];

  const { title, categories, highlights } = useMemo(() => {
    const content = getWhatsNewContent(
      { t, exists: i18n.exists.bind(i18n) },
      version,
    );
    return {
      title: content.title,
      categories: categorizeFeatures(content.features),
      highlights: content.highlights,
    };
  }, [t, i18n, version]);

  return (
    <DialogContent
      className={cn(
        "wn-dialog-enter max-h-[85dvh] flex flex-col gap-0 overflow-hidden border-primary/15 p-0",
        highlights.length > 0 ? "max-w-3xl" : "max-w-lg",
      )}>
      <DialogHeader className='relative shrink-0 overflow-hidden px-6 pt-7 pb-5'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)]'
        />

        <div className='relative flex items-center gap-1.5'>
          <SparkleIcon className='size-4 shrink-0 text-primary' weight='fill' />
          <span className='font-primary font-semibold text-primary text-xs uppercase leading-none tracking-[0.15em]'>
            {t("whatsNew.title")}
          </span>
          <VersionBadge from={from} to={version} />
        </div>

        <DialogTitle className='relative mt-2 font-primary font-bold text-[1.65rem] leading-[1.15] tracking-tight text-foreground'>
          {title}
        </DialogTitle>

        <DialogDescription className='mt-1.5 text-muted-foreground text-xs leading-relaxed'>
          {t("whatsNew.welcome", { appName: APP_NAME })}
        </DialogDescription>

        {from && skipped.length > 0 && (
          <SkippedReleases from={from} versions={skipped} />
        )}
      </DialogHeader>

      <Separator className='bg-primary/10' />

      {(videoId || highlights.length > 0 || categories.length > 0) && (
        <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
          {videoId && <YouTubeEmbed videoId={videoId} />}
          {highlights.length > 0 && <Highlights highlights={highlights} />}
          {categories.length > 0 && (
            <div className='space-y-5 px-6 py-5'>
              {categories.map((category, idx) => (
                <CategorySection
                  category={category}
                  categoryIndex={idx}
                  key={category.key}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Separator className='bg-primary/10' />

      <DialogFooter className='shrink-0 flex flex-row items-center justify-between px-6 py-4'>
        <Button
          className='gap-2 text-xs'
          onClick={() => openUrl(getReleaseNotesUrl(version))}
          size='sm'
          variant='outline'>
          <ArrowSquareOutIcon className='size-3.5' />
          {t("whatsNew.fullReleaseNotes")}
        </Button>
        <Button className='px-6 text-xs' onClick={onClose} size='sm'>
          {t("whatsNew.gotIt")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};
