import { tint } from "@/components/plugins/plugin-identity";
import {
  type PluginTone,
  TONE_COLOR,
} from "@/components/plugins/plugin-status";

export const StatusPill = ({
  tone,
  label,
}: {
  tone: PluginTone;
  label: string;
}) => {
  const color = TONE_COLOR[tone];
  return (
    <span
      className='flex shrink-0 items-center gap-[5px] rounded-[6px] px-[7px] py-[2px]'
      style={{
        backgroundColor:
          tone === "neutral"
            ? "hsl(var(--foreground) / 0.06)"
            : tint(color, 12),
      }}>
      <span
        className='size-[6px] rounded-full'
        style={{ backgroundColor: color }}
      />
      <span
        className='font-semibold text-[11px] leading-[normal]'
        style={{ color }}>
        {label}
      </span>
    </span>
  );
};
