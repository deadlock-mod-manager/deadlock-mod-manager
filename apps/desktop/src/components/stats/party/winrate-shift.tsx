import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LOSS_COLOR, WIN_COLOR } from "@/components/stats/chart-fx";
import { formatDecimal } from "@/lib/stats/format";

/** Changes smaller than this round to "0.0 pts" and say nothing. */
const MIN_SHIFT = 0.0005;

/**
 * How far the last pick moved the expected winrate, floated up beside the
 * number and faded, so each change to the party shows what it did.
 */
export const WinrateShift = ({ expected }: { expected: number | null }) => {
  const { t } = useTranslation();
  const [previous, setPrevious] = useState(expected);
  const [shift, setShift] = useState<{ delta: number; key: number } | null>(
    null,
  );

  // Compared during render rather than in an effect, so the chip shows in the
  // same frame as the new number.
  if (expected !== previous) {
    setPrevious(expected);
    const delta =
      expected !== null && previous !== null ? expected - previous : 0;
    setShift(
      Math.abs(delta) >= MIN_SHIFT
        ? { delta, key: (shift?.key ?? 0) + 1 }
        : null,
    );
  }

  if (!shift) return null;
  return (
    <span
      aria-live='polite'
      className='party-shift font-mono font-semibold text-[13px]'
      // A new key restarts the animation when the next change comes quickly.
      key={shift.key}
      style={{ color: shift.delta > 0 ? WIN_COLOR : LOSS_COLOR }}>
      {t("stats.party.odds.shift", {
        value: `${shift.delta > 0 ? "+" : "−"}${formatDecimal(Math.abs(shift.delta) * 100, 1)}`,
      })}
    </span>
  );
};
