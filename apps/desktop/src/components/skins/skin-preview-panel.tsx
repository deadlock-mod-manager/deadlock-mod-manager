import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowClockwiseIcon,
  CubeIcon,
  EyeSlashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FoundrySkinAssembling } from "@/components/foundry/foundry-assembling";
import { FoundryLoadingBar } from "@/components/foundry/foundry-loading-bar";
import { FoundryModelViewer } from "@/components/foundry/foundry-model-viewer";
import { useSkinModelPreview } from "@/hooks/use-skin-model-preview";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface SkinPreviewPanelProps {
  hero: string;
  /** The skin to show, or null for the hero's default look. */
  mod: LocalMod | null;
}

/**
 * The 3D turntable beside the skin grid: the selected skin's hero model,
 * decoded from its VPK and rendered with the Foundry's viewer.
 *
 * This is a look, not an editor — nothing here writes to the skin. The whole
 * panel is behind the same setting as the Foundry's preview, because it is the
 * same decode-and-render on the same GPU, and it fails in the same ways.
 */
export const SkinPreviewPanel = ({ hero, mod }: SkinPreviewPanelProps) => {
  const { t } = useTranslation();
  const enabled = usePersistedStore((state) => state.foundry3dPreviewEnabled);
  const setEnabled = usePersistedStore(
    (state) => state.setFoundry3dPreviewEnabled,
  );
  const preview = useSkinModelPreview(hero, mod, enabled);
  const label = mod?.name ?? t("skins.preview.defaultLabel", { hero });

  return (
    // The panel scales with the window rather than holding one fixed width, so
    // it keeps its share of the page from a small window up to a maximised one.
    <aside className='flex w-[clamp(320px,28vw,640px)] shrink-0 flex-col gap-3'>
      {enabled && (
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h3 className='truncate font-semibold text-sm'>
              {t("skins.preview.title")}
            </h3>
            <p className='truncate text-muted-foreground text-xs' title={label}>
              {label}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("skins.preview.hide")}
                className='h-7 w-7 shrink-0'
                onClick={() => setEnabled(false)}
                size='icon'
                variant='ghost'>
                <EyeSlashIcon className='h-4 w-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("skins.preview.hide")}</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-b from-muted/40 to-background'>
        {enabled ? (
          <PreviewSurface label={label} preview={preview} />
        ) : (
          <PanelNotice
            action={
              <Button
                onClick={() => setEnabled(true)}
                size='sm'
                variant='outline'>
                {t("skins.preview.enable")}
              </Button>
            }
            description={t("skins.preview.disabledHint")}
            icon={
              <CubeIcon
                className='h-12 w-12 text-muted-foreground opacity-40'
                weight='duotone'
              />
            }
            title={t("skins.preview.disabled")}
          />
        )}
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
  preview: ReturnType<typeof useSkinModelPreview>;
  label: string;
}

const PreviewSurface = ({ preview, label }: PreviewSurfaceProps) => {
  const { t } = useTranslation();

  // The assembling figure stands in for the model so the panel never sits empty.
  if (preview.isPending) {
    return (
      <>
        <FoundrySkinAssembling />
        <div className='absolute inset-x-0 bottom-0 space-y-2 p-6'>
          <p className='text-center text-muted-foreground text-sm'>
            {t("skins.preview.loading")}
          </p>
          <FoundryLoadingBar />
        </div>
      </>
    );
  }

  if (preview.isError || preview.data.kind === "unsupported") {
    return (
      <PanelNotice
        action={
          preview.isError ? (
            <Button
              icon={<ArrowClockwiseIcon className='h-4 w-4' />}
              onClick={() => void preview.refetch()}
              size='sm'
              variant='outline'>
              {t("skins.preview.retry")}
            </Button>
          ) : undefined
        }
        description={t("skins.preview.failedHint")}
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

  return <FoundryModelViewer dataUrl={preview.data.dataUrl} label={label} />;
};
