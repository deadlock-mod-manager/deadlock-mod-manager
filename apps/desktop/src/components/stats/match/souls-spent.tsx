import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart } from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import { tint } from "@/components/stats/chart-fx";
import { slotColor } from "@/components/stats/match/item-tile";
import {
  type Purchase,
  SLOT_TYPES,
  spendBySlot,
} from "@/lib/stats/match-analysis";

/** Souls spent per slot as a donut, the biggest share in the middle. */
export const SoulsSpent = ({ bought }: { bought: Purchase[] }) => {
  const { t, i18n } = useTranslation();
  const spend = spendBySlot(bought);
  const total = SLOT_TYPES.reduce((sum, slot) => sum + spend[slot], 0);
  const data = SLOT_TYPES.map((slot) => ({ slot, value: spend[slot] })).sort(
    (a, b) => b.value - a.value,
  );
  const top = data[0];

  return (
    <ChartCard
      description={t("stats.match.spentDescription", {
        souls: total.toLocaleString(i18n.language),
        count: bought.length,
      })}
      title={t("stats.match.spent")}>
      <div className='flex h-full items-center gap-6'>
        <div className='relative h-[140px] w-[140px] shrink-0'>
          <PieChart height={140} width={140}>
            <Pie
              cornerRadius={3}
              data={data}
              dataKey='value'
              endAngle={-270}
              innerRadius={52}
              isAnimationActive={false}
              outerRadius={68}
              paddingAngle={2}
              startAngle={90}
              stroke='none'>
              {data.map((entry) => (
                <Cell
                  fill={slotColor(entry.slot)}
                  key={entry.slot}
                  style={{
                    filter: `drop-shadow(0 0 5px ${tint(slotColor(entry.slot), 40)})`,
                  }}
                />
              ))}
            </Pie>
          </PieChart>
          {top && total > 0 && (
            <div className='absolute inset-0 flex flex-col items-center justify-center'>
              <span className='font-bold text-2xl leading-none tabular-nums'>
                {Math.round((top.value / total) * 100)}%
              </span>
              <span className='mt-1 text-[11px] text-muted-foreground'>
                {t(`stats.match.slots.${top.slot}`)}
              </span>
            </div>
          )}
        </div>
        <ul className='flex flex-col gap-3'>
          {data.map((entry) => (
            <li className='flex flex-col gap-0.5' key={entry.slot}>
              <span className='flex items-center gap-2 font-medium text-[12.5px]'>
                <span
                  className='h-2 w-2 rounded-[2px]'
                  style={{ backgroundColor: slotColor(entry.slot) }}
                />
                {t(`stats.match.slots.${entry.slot}`)}
              </span>
              <span className='pl-4 font-mono text-[11px] text-muted-foreground'>
                {t("stats.match.soulsAmount", {
                  souls: entry.value.toLocaleString(i18n.language),
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
};
