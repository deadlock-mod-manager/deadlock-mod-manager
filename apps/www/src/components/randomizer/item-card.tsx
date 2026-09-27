import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@deadlock-mods/ui/components/hover-card";
import { ArrowRight, Sparkles, Star, Zap } from "@deadlock-mods/ui/icons";
import {
  CATEGORY_LABELS,
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
  formatSouls,
  MicroLabel,
  stripMarkup,
  TierPips,
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
  const category = item.item_slot_type;
  const image = itemImage(item);
  const description = stripMarkup(item.description.desc ?? undefined);
  const sections = itemTooltip(item);
  const large = size === "large";

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger asChild>
        <div
          className='flex min-w-0 cursor-default items-center gap-3 outline-none'
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
                  title='Active item'>
                  <Zap className='size-3' />
                  Active
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
            {CATEGORY_LABELS[category]} · Tier {item.item_tier} ·{" "}
            <span className='text-dl-souls'>{formatSouls(item.cost ?? 0)}</span>
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
                    {section.kind}
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
          ? `${item.name}, upgraded into ${upgrade.name}`
          : `${item.name}, ${CATEGORY_LABELS[category]} tier ${item.item_tier}`
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
            {CATEGORY_LABELS[item.item_slot_type]} →
          </span>
        ) : null}
        <span className={cn("dl-label", CATEGORY_TEXT[category])}>
          {CATEGORY_LABELS[category]}
        </span>
        {upgrade ? (
          <span className='dl-label text-muted-foreground/60'>· Upgrade</span>
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
              priceTitle={`${formatSouls(upgrade.cost ?? 0)} souls, less the ${formatSouls(item.cost ?? 0)} already paid for ${item.name}`}
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
              title='Rated highly for this hero in the draft data'>
              <Star className='size-3' />
              Good fit
            </span>
          ) : null}
          {imbueSlot ? (
            <span
              className='flex min-w-0 items-center gap-1 truncate text-dl-spirit/90'
              title={
                imbueLapses
                  ? `${item.name} imbues an ability, ${upgrade?.name} works on all of them`
                  : undefined
              }>
              <Sparkles className='size-3 shrink-0' />
              Imbue on {imbueTarget?.name ?? `Ability ${imbueSlot}`}
              {imbueLapses ? " until upgraded" : null}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
};
