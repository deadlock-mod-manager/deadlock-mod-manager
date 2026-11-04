import { Slider } from "@deadlock-mods/ui/components/slider";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import {
  type FoundrySoundAdjust,
  NO_SOUND_ADJUST,
  useFoundry,
} from "./foundry-context";
import { GAIN_MAX_DB, GAIN_MIN_DB } from "./foundry-sound-utils";
import { SwitchRow } from "./foundry-sound-switch-row";

/**
 * How loud the clip plays in the game. Each change rebuilds the clip from its
 * source, so edits never stack on audio that was already processed.
 */
export const InGameSection = ({
  entryPath,
  disabled,
}: {
  entryPath: string;
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  const { soundSettings, adjustSound } = useFoundry();
  const saved = soundSettings.get(entryPath) ?? NO_SOUND_ADJUST;
  const [draftGain, setDraftGain] = useState<number | null>(null);
  const gain = draftGain ?? saved.gainDb;

  const apply = (change: Partial<FoundrySoundAdjust>) => {
    adjustSound(entryPath, {
      gainDb: saved.gainDb,
      normalize: saved.normalize,
      mute: saved.mute,
      ...change,
    })
      .catch((err) => {
        logger.withError(err).error("[Foundry] Sound adjust failed");
        toast.error(t("foundry.sounds.adjustFailed"));
      })
      .finally(() => setDraftGain(null));
  };

  return (
    <section className='space-y-3.5 border-b px-4 py-3.5'>
      <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
        {t("foundry.sounds.inGame")}
      </h3>
      <div className='space-y-2'>
        <div className='flex items-center text-xs'>
          <span className='font-medium'>{t("foundry.sounds.gain")}</span>
          <span className='ml-auto font-mono text-[11px] text-muted-foreground'>
            {t("foundry.sounds.gainValue", {
              value: gain > 0 ? `+${gain}` : gain,
            })}
          </span>
        </div>
        <div className='relative'>
          <Slider
            aria-label={t("foundry.sounds.gain")}
            disabled={disabled || saved.mute}
            max={GAIN_MAX_DB}
            min={GAIN_MIN_DB}
            onValueChange={([next]) => setDraftGain(next)}
            onValueCommit={([next]) => {
              if (next === saved.gainDb) {
                setDraftGain(null);
              } else {
                apply({ gainDb: next });
              }
            }}
            step={1}
            value={[gain]}
          />
          <span
            aria-hidden
            className='pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50'
            style={{
              left: `${(-GAIN_MIN_DB / (GAIN_MAX_DB - GAIN_MIN_DB)) * 100}%`,
            }}
          />
        </div>
      </div>
      <SwitchRow
        checked={saved.normalize}
        disabled={disabled || saved.mute}
        hint={t("foundry.sounds.normalizeHint")}
        label={t("foundry.sounds.normalize")}
        onCheckedChange={(normalize) => apply({ normalize })}
      />
      <SwitchRow
        checked={saved.mute}
        disabled={disabled}
        hint={t("foundry.sounds.muteClipHint")}
        label={t("foundry.sounds.muteClip")}
        onCheckedChange={(mute) => apply({ mute })}
      />
    </section>
  );
};
