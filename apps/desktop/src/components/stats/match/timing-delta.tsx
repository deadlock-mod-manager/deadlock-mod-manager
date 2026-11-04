import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";

export const Delta = ({ good, text }: { good: boolean; text: string }) => (
  <span
    className='shrink-0 rounded-full px-2 py-0.5 font-mono font-semibold text-[11px]'
    style={{
      color: good ? WIN_COLOR : LOSS_COLOR,
      backgroundColor: tint(good ? WIN_COLOR : LOSS_COLOR, 11),
    }}>
    {text}
  </span>
);
