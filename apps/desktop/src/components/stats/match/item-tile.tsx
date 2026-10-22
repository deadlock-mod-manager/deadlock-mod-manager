import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import type { DeadlockItem } from "@/lib/deadlock-api";
import { cn } from "@/lib/utils";

export const slotColor = (slot: string | undefined) =>
  slot === "weapon" || slot === "vitality" || slot === "spirit"
    ? `var(--slot-${slot})`
    : "hsl(var(--muted-foreground))";

export const teamColor = (team: number) => `var(--team-${team === 0 ? 0 : 1})`;

/** A team's swatch, name and result, as every team block on the match page opens. */
export const TeamLabel = ({ team, won }: { team: number; won: boolean }) => {
  const { t } = useTranslation();
  const tone = won ? WIN_COLOR : LOSS_COLOR;
  return (
    <div className='flex items-center gap-2.5'>
      <span
        className='h-2.5 w-2.5 rounded-[3px]'
        style={{ backgroundColor: teamColor(team) }}
      />
      <span className='font-semibold text-sm'>
        {t(`stats.match.teams.${team === 0 ? 0 : 1}`)}
      </span>
      <span
        className='rounded-full px-2 py-0.5 font-medium text-[11.5px]'
        style={{ color: tone, backgroundColor: tint(tone, 12) }}>
        {won ? t("stats.match.victory") : t("stats.match.defeat")}
      </span>
    </div>
  );
};

/** An item the way the shop shows it: the art on its slot colour. */
export const ItemTile = ({
  item,
  className,
  faded = false,
  hint,
}: {
  item: DeadlockItem;
  className?: string;
  faded?: boolean;
  /** Extra tooltip line under the name, e.g. when it was bought. */
  hint?: string;
}) => {
  const image = item.shop_image_webp ?? item.shop_image;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={item.name}
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            faded && "opacity-40",
            className,
          )}
          role='img'
          style={{
            background: `linear-gradient(180deg, rgb(255 255 255 / 0.15), rgb(0 0 0 / 0.25)), ${slotColor(item.item_slot_type)}`,
          }}
          tabIndex={0}>
          {image ? (
            <img
              alt=''
              className='h-[78%] w-[78%] object-contain'
              src={image}
            />
          ) : (
            <span className='font-semibold text-white text-xs'>
              {item.name.charAt(0)}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className='font-medium'>{item.name}</div>
        {hint && <div className='text-muted-foreground text-xs'>{hint}</div>}
      </TooltipContent>
    </Tooltip>
  );
};
