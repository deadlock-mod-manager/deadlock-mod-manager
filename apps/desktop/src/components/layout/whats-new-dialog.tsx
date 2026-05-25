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
  PlusIcon,
  SparkleIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type ReactNode, useMemo } from "react";
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

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { t } = useTranslation();
  const { data } = useAbout();

  const version = data?.version || "0.10.0";

  const currentUpdate = t(`whatsNew.versions.${version}`, {
    returnObjects: true,
  }) as
    | {
        title: string;
        features: string[];
      }
    | undefined;

  const categories = useMemo(() => {
    if (!currentUpdate?.features) return [];
    return categorizeFeatures(currentUpdate.features);
  }, [currentUpdate?.features]);

  return (
    <DialogContent className='wn-dialog-enter max-h-[85dvh] max-w-lg flex flex-col gap-0 overflow-hidden border-primary/15 p-0'>
      <DialogHeader className='relative shrink-0 overflow-hidden px-6 pt-6 pb-4'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent'
        />
        <div className='relative flex items-center gap-3'>
          <div className='flex size-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10'>
            <SparkleIcon className='size-4 text-primary' weight='duotone' />
          </div>
          <div className='flex flex-col gap-0.5'>
            <div className='flex items-center gap-2.5'>
              <DialogTitle className='text-base leading-none'>
                {t("whatsNew.title")}
              </DialogTitle>
              <Badge
                className='rounded-md border-primary/20 bg-primary/10 font-mono text-primary text-[11px]'
                variant='outline'>
                v{version}
              </Badge>
            </div>
            <DialogDescription className='text-xs'>
              {t("whatsNew.welcome", { appName: APP_NAME })}
            </DialogDescription>
          </div>
        </div>

        {currentUpdate && (
          <p
            className='wn-title-enter relative mt-3 font-medium text-foreground/90 text-sm leading-snug'
            style={{ fontFamily: '"Forevs Demo", serif' }}>
            {currentUpdate.title}
          </p>
        )}
      </DialogHeader>

      <Separator className='bg-primary/10' />

      {categories.length > 0 && (
        <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
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
