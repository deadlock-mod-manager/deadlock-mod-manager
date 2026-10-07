import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@deadlock-mods/ui/components/hover-card";
import { ArrowRight, Sparkles, Star, Zap } from "@deadlock-mods/ui/icons";
import { Trans, useTranslation } from "react-i18next";
import {
  type DeadlockAbility,
  type DeadlockUpgrade,
  itemImage,
  itemTooltip,
} from "@/lib/deadlock-assets";
import { finalItem, type RolledItem } from "@/lib/randomizer/roll";
import { cn } from "@/lib/utils";
import {
  CATEGORY_BORDER,
  CATEGORY_TEXT,
  CATEGORY_TINT,
  MicroLabel,
  stripMarkup,
  TierPips,
  useFormatSouls,
} from "./primitives";

interface ItemCardProps {
  entry: RolledItem;
  order: number;
  imbueTarget?: DeadlockAbility;
}

/** One item with its shop description on hover. */
const ItemFace = ({
  item,
  price,
  priceTitle,
  size,
}: {
  item: DeadlockUpgrade;
  /** What the player pays at this step, which for an upgrade is the difference. */
  price: string;
  priceTitle?: string;
  size: "large" | "small";
}) => {
  const { t } = useTranslation("tool-randomizer");
  const formatSouls = useFormatSouls();
  const category = item.item_slot_type;
  const image = itemImage(item);
  const description = stripMarkup(item.description.desc ?? undefined);
  const sections = itemTooltip(item);
  const large = size === "large";

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger asChild>
        <div
          className='flex min-w-0 cursor-default items-center gap-3 outline-none focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--hero))]'
          tabIndex={0}>
          <div
            className={cn(
              "dl-notch-sm grid shrink-0 place-items-center border",
              large ? "size-16" : "size-12",
              CATEGORY_BORDER[category],
              CATEGORY_TINT[category],
            )}>
            {image ? (
              <img
                alt=''
                className={cn("object-contain", large ? "size-11" : "size-8")}
                loading='lazy'
                src={image}
              />
            ) : null}
          </div>
          <div className='min-w-0 flex-1'>
            <TierPips category={category} tier={item.item_tier} />
            <h3
              className={cn(
                "mt-1.5 line-clamp-2 font-medium text-dl-offwhite leading-tight",
                large ? "text-base" : "text-sm",
              )}>
              {item.name}
            </h3>
            <div className='mt-1 flex items-center gap-2 text-xs'>
              <span
                className='font-mono text-dl-souls tabular-nums'
                title={priceTitle}>
                {price}
              </span>
              {item.is_active_item ? (
                <span
                  className='flex items-center gap-0.5 text-dl-gold/80'
                  title={t("item.activeTitle")}>
                  <Zap className='size-3' />
                  {t("item.active")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </HoverCardTrigger>

      {/* Portaled out of the page, so it takes the category colour rather
          than the hero accent, which only exists inside the page. */}
      <HoverCardContent
        className={cn("w-80 bg-background-dark p-0", CATEGORY_BORDER[category])}
        collisionPadding={12}>
        <div className='border-border/40 border-b px-4 pt-3 pb-2.5'>
          <MicroLabel className='mb-1'>
            <Trans
              components={{ souls: <span className='text-dl-souls' /> }}
              i18nKey='item.tooltipHeader'
              t={t}
              values={{
                category: t(`categories.${category}`),
                tier: item.item_tier,
                cost: formatSouls(item.cost ?? 0),
              }}
            />
          </MicroLabel>
          <h4
            className={cn(
              "font-primary font-bold text-lg",
              CATEGORY_TEXT[category],
            )}>
            {item.name}
          </h4>
        </div>
        <div className='space-y-3 px-4 py-3'>
          {sections.length > 0 ? (
            sections.map((section) => (
              <div
                key={`${section.kind ?? "section"}:${section.text ?? section.stats[0]?.label}`}>
                {section.kind === "active" || section.kind === "passive" ? (
                  <MicroLabel className='mb-1 text-dl-gold/80'>
                    {t(`item.sectionKinds.${section.kind}`)}
                  </MicroLabel>
                ) : null}
                {section.text ? (
                  <p className='text-muted-foreground text-sm leading-relaxed'>
                    {stripMarkup(section.text)}
                  </p>
                ) : null}
                {section.stats.length > 0 ? (
                  <dl className='mt-1.5 space-y-0.5 text-xs'>
                    {section.stats.map((stat) => (
                      <div
                        key={`${stat.label}:${stat.value}`}
                        className='flex items-baseline justify-between gap-3'>
                        <dt className='text-muted-foreground'>{stat.label}</dt>
                        <dd className='font-mono text-dl-offwhite tabular-nums'>
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ))
          ) : description ? (
            <p className='text-muted-foreground text-sm leading-relaxed'>
              {description}
            </p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

/**
 * One item slot of the build. A slot that gets upgraded is split in two: what
 * is bought first on the left, what it turns into on the right.
 */
export const ItemCard = ({ entry, order, imbueTarget }: ItemCardProps) => {
  const { t } = useTranslation("tool-randomizer");
  const formatSouls = useFormatSouls();
  const { item, upgrade, imbueSlot } = entry;
  const final = finalItem(entry);
  const category = final.item_slot_type;
  // Some imbues upgrade into an item that works on every ability, like Mystic
  // Expansion into Greater Expansion - the imbue only lasts until then.
  const imbueLapses = Boolean(upgrade && item.imbue && !upgrade.imbue);

  return (
    <article
      aria-label={
        upgrade
          ? t("item.ariaUpgrade", { item: item.name, upgrade: upgrade.name })
          : t("item.ariaItem", {
              item: item.name,
              category: t(`categories.${category}`),
              tier: item.item_tier,
            })
      }
      className={cn(
        "dl-notch-sm animate-dl-rise flex h-full flex-col border bg-background-dark/80 transition-colors",
        CATEGORY_BORDER[category],
        "hover:bg-background-dark focus-within:outline-2 focus-within:outline-[rgb(var(--hero))]",
      )}
      style={{ animationDelay: `${order * 45}ms` }}>
      <header className='flex items-center gap-2 border-border/40 border-b px-3 py-1.5'>
        <span className='font-mono text-[11px] text-[rgb(var(--hero))] tabular-nums'>
          {String(order).padStart(2, "0")}
        </span>
        {/* A handful of upgrades change category, like Spirit Lifesteal into
            Spiritual Overflow, so both ends are named when they differ. */}
        {item.item_slot_type !== category ? (
          <span className={cn("dl-label", CATEGORY_TEXT[item.item_slot_type])}>
            {t("item.categoryChange", {
              category: t(`categories.${item.item_slot_type}`),
            })}
          </span>
        ) : null}
        <span className={cn("dl-label", CATEGORY_TEXT[category])}>
          {t(`categories.${category}`)}
        </span>
        {upgrade ? (
          <span className='dl-label text-muted-foreground/60'>
            {t("item.upgrade")}
          </span>
        ) : null}
        <span className='ml-auto font-mono text-muted-foreground text-xs tabular-nums'>
          {formatSouls(final.cost ?? 0)}
        </span>
      </header>

      <div className='flex-1 p-3'>
        {upgrade ? (
          <div className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'>
            <ItemFace
              item={item}
              price={formatSouls(item.cost ?? 0)}
              size='small'
            />
            <span
              aria-hidden='true'
              className='grid size-6 place-items-center rounded-full border border-border/60 bg-background text-muted-foreground'>
              <ArrowRight className='size-3.5' />
            </span>
            <ItemFace
              item={upgrade}
              price={`+${formatSouls((upgrade.cost ?? 0) - (item.cost ?? 0))}`}
              priceTitle={t("item.upgradePriceTitle", {
                total: formatSouls(upgrade.cost ?? 0),
                paid: formatSouls(item.cost ?? 0),
                item: item.name,
              })}
              size='small'
            />
          </div>
        ) : (
          <ItemFace
            item={item}
            price={formatSouls(item.cost ?? 0)}
            size='large'
          />
        )}
      </div>

      {entry.recommended || imbueSlot ? (
        <footer className='flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2.5 text-[11px]'>
          {entry.recommended ? (
            <span
              className='flex items-center gap-1 text-[rgb(var(--hero))]'
              title={t("item.goodFitTitle")}>
              <Star className='size-3' />
              {t("item.goodFit")}
            </span>
          ) : null}
          {imbueSlot ? (
            <span
              className='flex min-w-0 items-center gap-1 truncate text-dl-spirit/90'
              title={
                imbueLapses
                  ? t("item.imbueLapsesTitle", {
                      item: item.name,
                      upgrade: upgrade?.name,
                    })
                  : undefined
              }>
              <Sparkles className='size-3 shrink-0' />
              {t(imbueLapses ? "item.imbueOnUntilUpgraded" : "item.imbueOn", {
                ability:
                  imbueTarget?.name ??
                  t("abilities.fallback", { slot: imbueSlot }),
              })}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
};
