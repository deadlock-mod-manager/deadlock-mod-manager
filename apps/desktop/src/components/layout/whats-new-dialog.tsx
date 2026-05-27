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
import { APP_NAME, GITHUB_REPO } from "@/lib/constants";

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

const getFeatures = (
  t: (
    key: string,
    options?: { returnObjects?: boolean; defaultValue?: string[] },
  ) => string | string[],
  version: string,
): string[] => {
  const features = t(`whatsNew.versions.${version}.features`, {
    returnObjects: true,
    defaultValue: [],
  });
  if (!Array.isArray(features)) return [];
  return features.filter((f): f is string => typeof f === "string");
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

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { t } = useTranslation();
  const { data } = useAbout();

  const version = data?.version || "0.10.0";

  const title = t(`whatsNew.versions.${version}.title`, { defaultValue: "" });
  const videoId = t(`whatsNew.versions.${version}.videoId`, {
    defaultValue: "",
  });

  const categories = useMemo(() => {
    const features = getFeatures(t, version);
    if (features.length === 0) return [];
    return categorizeFeatures(features);
  }, [t, version]);

  return (
    <DialogContent className='wn-dialog-enter max-h-[85dvh] max-w-lg flex flex-col gap-0 overflow-hidden border-primary/15 p-0'>
      <DialogHeader className='relative shrink-0 overflow-hidden px-6 pt-7 pb-5'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)]'
        />

        <div className='relative flex items-center gap-2'>
          <SparkleIcon className='size-3.5 text-primary/70' weight='duotone' />
          <span
            className='font-primary font-bold text-[10px] text-primary/70 uppercase tracking-[0.35em]'>
            {t("whatsNew.title")}
          </span>
          <Badge
            className='ml-auto rounded-md border-primary/20 bg-primary/[0.07] font-mono text-primary/80 text-[10px] tabular-nums'
            variant='outline'>
            v{version}
          </Badge>
        </div>

        <DialogTitle className='relative mt-2 font-primary font-bold text-[1.65rem] leading-[1.15] tracking-tight text-foreground'>
          {title || t("whatsNew.title")}
        </DialogTitle>

        <DialogDescription className='mt-1.5 text-muted-foreground text-xs leading-relaxed'>
          {t("whatsNew.welcome", { appName: APP_NAME })}
        </DialogDescription>
      </DialogHeader>

      <Separator className='bg-primary/10' />

      {(videoId || categories.length > 0) && (
        <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
          {videoId && <YouTubeEmbed videoId={videoId} />}
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
          onClick={() => openUrl(`${GITHUB_REPO}/releases/tag/v${version}`)}
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
