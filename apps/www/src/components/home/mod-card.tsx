import { useTranslation } from "react-i18next";
import { useNumberFormat } from "@/lib/i18n/route";
import {
  heroIcon,
  modThumbnail,
  modUrl,
  type PreviewMod,
} from "./app-preview/mods";

const categoryKeys = {
  Skins: "skins",
  "Quality of Life": "qualityOfLife",
} as const satisfies Record<PreviewMod["category"], string>;

/** A community mod from the store snapshot, linked to its GameBanana page. */
export const ModCard = ({
  mod,
  showDownloads = false,
}: {
  mod: PreviewMod;
  showDownloads?: boolean;
}) => {
  const { t } = useTranslation("common");
  const compactNumber = useNumberFormat({ notation: "compact" });
  const category = categoryKeys[mod.category];
  const kind = mod.hero
    ? t("modCard.heroSkin", { hero: mod.hero })
    : t(`modCard.categories.${category}`);
  const byline = { kind, author: mod.author };

  return (
    <a
      href={modUrl(mod)}
      target='_blank'
      rel='noopener noreferrer'
      className='group block overflow-hidden rounded-xl border border-border bg-surface hover:border-border-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
      <span className='block overflow-hidden'>
        <img
          src={modThumbnail(mod)}
          alt={
            mod.hero
              ? t("modCard.alt.heroSkin", { name: mod.name, hero: mod.hero })
              : t(`modCard.alt.${category}`, { name: mod.name })
          }
          width={480}
          height={360}
          loading='lazy'
          className='aspect-[4/3] w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]'
        />
      </span>
      <span className='flex items-start gap-2.5 p-3'>
        {mod.hero && (
          <img
            src={heroIcon(mod.hero)}
            alt=''
            width={28}
            height={28}
            loading='lazy'
            className='size-7 shrink-0 rounded-full bg-background'
          />
        )}
        <span className='min-w-0'>
          <span className='block truncate font-semibold text-sm'>
            {mod.name}
          </span>
          <span className='block truncate text-muted-foreground text-xs'>
            {showDownloads
              ? t("modCard.bylineWithDownloads", {
                  ...byline,
                  downloads: compactNumber.format(mod.downloads),
                })
              : t("modCard.byline", byline)}
          </span>
        </span>
      </span>
    </a>
  );
};
