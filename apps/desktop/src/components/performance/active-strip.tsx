import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { PerfTier } from "@/types/generated/PerfTier";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  GaugeIcon,
  SlidersHorizontalIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Chip } from "./configs/card-parts";
import { justApplied } from "./just-applied";
import { usePerformanceUi } from "./performance-context";
import { TierIcon } from "./tier-icon";
import { TurnOffButton } from "./turn-off-button";
import { UndoButton } from "./undo-button";

export const ActiveStrip = ({
  status,
  desired,
  name,
  tier,
}: {
  status: PerfStatus;
  desired: DesiredOverlay;
  name: string;
  tier: PerfTier | null;
}) => {
  const { t } = useTranslation();
  const { openEditor } = usePerformanceUi();
  const configId = desired.request.configId;
  const tweakCount = usePersistedStore(
    (state) => state.perfOverrides[configId]?.length ?? 0,
  );
  const summary = [
    tier && t(`performance.tiers.${tier}.label`),
    status.inSync
      ? t("performance.activeStatus.inFile", { count: desired.counts.applies })
      : t("performance.activeStatus.settings", {
          count: desired.counts.applies,
        }),
    tweakCount > 0 &&
      t("performance.activeStatus.tweaks", { count: tweakCount }),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      aria-label={t("performance.activeStatus.label")}
      className='flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card px-4 py-3.5'>
      <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
        {tier ? (
          <TierIcon
            className='size-5'
            draw={justApplied(desired.appliedAt)}
            key={desired.appliedAt}
            tier={tier}
          />
        ) : (
          <GaugeIcon aria-hidden className='size-5' weight='duotone' />
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground text-xs'>
          {t("performance.activeStatus.current")}
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='truncate font-semibold text-base'>{name}</h2>
          {!status.inSync && (
            <Chip icon={<WarningIcon aria-hidden />} tone='warning'>
              {t("performance.activeStatus.notWritten")}
            </Chip>
          )}
        </div>
        <p className='mt-0.5 text-muted-foreground text-sm'>{summary}</p>
      </div>
      <div className='flex items-center gap-1.5'>
        <UndoButton compact currentConfigId={configId} />
        <Button
          icon={<SlidersHorizontalIcon aria-hidden />}
          onClick={() => openEditor(configId)}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.editSettings")}
        </Button>
        <TurnOffButton name={name} />
      </div>
    </section>
  );
};
