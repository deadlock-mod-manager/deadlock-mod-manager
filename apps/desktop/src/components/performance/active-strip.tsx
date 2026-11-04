import { tierInfo } from "@/lib/performance/scale";
import { usePersistedStore } from "@/lib/store";
import type { DesiredOverlay } from "@/types/generated/DesiredOverlay";
import type { PerfStatus } from "@/types/generated/PerfStatus";
import type { PerfTier } from "@/types/generated/PerfTier";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  GaugeIcon,
  SlidersHorizontalIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Chip } from "./configs/card-parts";
import { OpenInEditorButton } from "./open-in-editor-button";
import { usePerformanceUi } from "./performance-context";
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
  const tweakCount = usePersistedStore(
    (state) => state.perfOverrides[desired.request.configId]?.length ?? 0,
  );
  const summary = status.inSync
    ? t("performance.activeStatus.inFile", { count: desired.counts.applies })
    : t("performance.activeStatus.settings", { count: desired.counts.applies });

  return (
    <section
      aria-label={t("performance.activeStatus.label")}
      className='flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-3 pl-4'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-md bg-muted'>
        <GaugeIcon
          aria-hidden
          className='size-5 text-primary'
          weight='duotone'
        />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='truncate font-semibold'>{name}</h2>
          {tier && (
            <span className='text-muted-foreground text-sm'>
              <span aria-hidden>{tierInfo(tier).emoji}</span>{" "}
              {t(`performance.tiers.${tier}.label`)}
            </span>
          )}
          {status.inSync ? (
            <Chip icon={<CheckCircleIcon aria-hidden />} tone='success'>
              {t("performance.activeStatus.active")}
            </Chip>
          ) : (
            <Chip icon={<WarningIcon aria-hidden />} tone='warning'>
              {t("performance.activeStatus.notWritten")}
            </Chip>
          )}
          {tweakCount > 0 && (
            <Chip icon={<SlidersHorizontalIcon aria-hidden />}>
              {t("performance.activeStatus.tweaks", { count: tweakCount })}
            </Chip>
          )}
        </div>
        <p className='mt-0.5 text-muted-foreground text-xs'>
          {summary}. {t("performance.activeStatus.takesEffect")}
        </p>
      </div>
      <div className='flex items-center gap-1.5'>
        <Button
          icon={<SlidersHorizontalIcon aria-hidden />}
          onClick={() => openEditor(desired.request.configId)}
          size='sm'
          variant='outline'>
          {t("performance.activeStatus.editSettings")}
        </Button>
        <OpenInEditorButton />
        <UndoButton currentConfigId={desired.request.configId} />
        <TurnOffButton name={name} />
      </div>
    </section>
  );
};
