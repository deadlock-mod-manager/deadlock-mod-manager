import { Plus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { tint } from "@/components/stats/chart-fx";
import { ItemTile, slotColor } from "@/components/stats/match/item-tile";
import {
  type Purchase,
  SLOT_TYPES,
  type SlotType,
} from "@/lib/stats/match-analysis";
import { slotOf } from "./purchase-slot";

const SLOTS_PER_TYPE = 4;

const EMPTY_KEYS = ["a", "b", "c", "d"] as const;

/** What the player ended the match holding, one row per slot type. */
export const FinalBuild = ({ bought }: { bought: Purchase[] }) => {
  const { t } = useTranslation();
  const held = bought.filter((purchase) => purchase.soldAt === null);
  const bySlot = (slot: SlotType) =>
    held.filter((purchase) => slotOf(purchase) === slot);

  return (
    <ChartCard
      description={t("stats.match.finalDescription")}
      title={t("stats.match.final")}>
      <div className='flex flex-col gap-2'>
        {SLOT_TYPES.map((slot) => {
          const items = bySlot(slot);
          const empty = Math.max(0, SLOTS_PER_TYPE - items.length);
          return (
            <div className='grid grid-cols-4 gap-2' key={slot}>
              {items.map((purchase) => (
                <ItemTile
                  className='aspect-square h-auto w-full rounded-lg'
                  item={purchase.item}
                  key={`${purchase.item.id}-${purchase.time}`}
                />
              ))}
              {EMPTY_KEYS.slice(0, empty).map((key) => (
                <div
                  aria-hidden
                  className='flex aspect-square items-center justify-center rounded-lg border'
                  key={key}
                  style={{
                    borderColor: tint(slotColor(slot), 35),
                    backgroundColor: tint(slotColor(slot), 5),
                  }}>
                  <Plus
                    className='h-3.5 w-3.5'
                    style={{ color: tint(slotColor(slot), 60) }}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
};
