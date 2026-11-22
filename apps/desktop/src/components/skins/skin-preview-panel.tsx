import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedModelPreview } from "@/components/foundry/animated-model-preview";
import { ModelLoadingStage } from "@/components/foundry/model-loading-stage";
import { CopyPreviewDetails } from "@/components/foundry/copy-preview-details";
import {
  type SkinPreviewStatus,
  SkinPreviewStatusRow,
} from "@/components/skins/skin-preview-status";
import { useSkinModelPreview } from "@/hooks/use-skin-model-preview";
import { getErrorMessage } from "@/lib/errors";
import { previewFailureLabel } from "@/lib/preview-failures";
import type { LocalMod } from "@/types/mods";

interface SkinPreviewPanelProps {
  hero: string;
  mod: LocalMod | null;
  status: SkinPreviewStatus;
  onWear: () => void;
  wearDisabled: boolean;
}

export const SkinPreviewPanel = ({
  hero,
  mod,
  status,
  onWear,
  wearDisabled,
}: SkinPreviewPanelProps) => {
  const { t } = useTranslation();
  const preview = useSkinModelPreview(hero, mod);
  const label = mod?.name ?? t("skins.preview.defaultLabel", { hero });
  const title = mod?.name ?? t("skins.default");

  return (
    <aside className='flex w-[clamp(320px,28vw,640px)] shrink-0 flex-col overflow-hidden rounded-xl border bg-card'>
      <div className='flex flex-col gap-1.5 border-b py-3 pr-2 pl-4'>
        <span className='font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]'>
          {t("skins.preview.title")}
        </span>
        <h3 className='truncate pr-2 font-semibold text-sm' title={title}>
          {title}
        </h3>
        <SkinPreviewStatusRow
          onWear={onWear}
          status={status}
          wearDisabled={wearDisabled}
        />
      </div>

      <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-muted/40 to-background'>
        <PreviewSurface hero={hero} label={label} preview={preview} />
      </div>
    </aside>
  );
};

interface PanelNoticeProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

const PanelNotice = ({
  icon,
  title,
  description,
  action,
}: PanelNoticeProps) => (
  <Empty className='border-0'>
    <EmptyHeader>
      <EmptyMedia>{icon}</EmptyMedia>
      <EmptyTitle className='text-sm'>{title}</EmptyTitle>
      <EmptyDescription className='text-xs'>{description}</EmptyDescription>
    </EmptyHeader>
    {action && <EmptyContent>{action}</EmptyContent>}
  </Empty>
);

interface PreviewSurfaceProps {
  hero: string | null;
  preview: ReturnType<typeof useSkinModelPreview>;
  label: string;
}

export const PreviewSurface = ({
  hero,
  preview,
  label,
}: PreviewSurfaceProps) => {
  const { t } = useTranslation();

  if (preview.isPending) {
    return (
      <ModelLoadingStage hero={hero} status={t("skins.preview.loading")} />
    );
  }

  if (preview.isError || (preview.data && preview.data.kind !== "model")) {
    return (
      <PanelNotice
        action={
          preview.isError ? (
            <div className='space-y-3'>
              <Button
                icon={<ArrowClockwiseIcon className='h-4 w-4' />}
                onClick={() => void preview.refetch()}
                size='sm'
                variant='outline'>
                {t("skins.preview.retry")}
              </Button>
              <CopyPreviewDetails details={getErrorMessage(preview.error)} />
            </div>
          ) : undefined
        }
        description={t(
          preview.isError
            ? previewFailureLabel(preview.error)
            : preview.data?.kind === "missingAssets"
              ? "modPreview.failures.previewMissingAssets"
              : "modPreview.unsupportedHint",
        )}
        icon={
          <WarningIcon
            className='h-12 w-12 text-amber-500 opacity-70'
            weight='duotone'
          />
        }
        title={t(
          preview.isError
            ? "skins.preview.failed"
            : "skins.preview.unsupported",
        )}
      />
    );
  }

  if (!preview.data || preview.data.kind !== "model") return null;
  return (
    <AnimatedModelPreview
      key={`${preview.data.filePath}:${preview.data.entryPath}`}
      hero={hero ?? undefined}
      model={preview.data.model}
      label={label}
      source={preview.data}
      comparisonSource={
        preview.data.stockFilePath
          ? {
              filePath: preview.data.stockFilePath,
              entryPath: preview.data.entryPath,
            }
          : undefined
      }
      comparisonRevision={preview.data.revision}
      comparisonAvailable={!!preview.data.stockFilePath}
    />
  );
};
