import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@deadlock-mods/ui/components/hover-card";
import { Sparkles, Star, Zap } from "@deadlock-mods/ui/icons";
import {
  CATEGORY_LABELS,
  type DeadlockAbility,
  itemImage,
} from "@/lib/deadlock-assets";
import type { RolledItem } from "@/lib/randomizer/roll";
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

export const ItemCard = ({ entry, order, imbueTarget }: ItemCardProps) => {
  const { item, imbueSlot } = entry;
  const category = item.item_slot_type;
  const image = itemImage(item);
  const description = stripMarkup(item.description.desc ?? undefined);

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger asChild>
        <article
          className={cn(
            "dl-notch-sm animate-dl-rise relative flex items-start gap-3 border bg-background-dark/80 p-3 transition-colors",
            CATEGORY_BORDER[category],
            "hover:bg-background-dark",
          )}
          style={{ animationDelay: `${order * 45}ms` }}>
          <span className='absolute top-2.5 right-3 font-mono text-[10px] text-muted-foreground/45 tabular-nums'>
            {String(order).padStart(2, "0")}
          </span>

          <div
            className={cn(
              "dl-notch-sm grid size-14 shrink-0 place-items-center border",
              CATEGORY_BORDER[category],
              CATEGORY_TINT[category],
            )}>
            {image ? (
              <img
                alt=''
                className='size-10 object-contain'
                loading='lazy'
                src={image}
              />
            ) : null}
          </div>

          <div className='min-w-0 flex-1 pt-0.5'>
            <TierPips category={category} tier={item.item_tier} />
            <h3 className='mt-1.5 truncate font-medium text-dl-offwhite text-sm'>
              {item.name}
            </h3>
            <div className='mt-1 flex items-center gap-2 text-xs'>
              <span className='font-mono text-dl-souls tabular-nums'>
                {formatSouls(item.cost ?? 0)}
              </span>
              {item.is_active_item ? (
                <span
                  className='flex items-center gap-1 text-dl-gold/80'
                  title='Active item'>
                  <Zap className='size-3' />
                  Active
                </span>
              ) : null}
              {entry.recommended ? (
                <span
                  className='flex items-center gap-1 text-[rgb(var(--hero))]'
                  title='Rated highly for this hero in the draft data'>
                  <Star className='size-3' />
                  Good fit
                </span>
              ) : null}
            </div>
            {imbueSlot ? (
              <div className='mt-1.5 flex items-center gap-1 truncate text-[11px] text-dl-spirit/90'>
                <Sparkles className='size-3 shrink-0' />
                Imbue on {imbueTarget?.name ?? `Ability ${imbueSlot}`}
              </div>
            ) : null}
          </div>
        </article>
      </HoverCardTrigger>

      <HoverCardContent className='w-80 border-[rgb(var(--hero)/0.25)] bg-background-dark'>
        <MicroLabel className='mb-2'>
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
        {description ? (
          <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
            {description}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
};
