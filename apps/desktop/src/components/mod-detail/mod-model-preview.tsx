import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  CubeIcon,
  CursorClickIcon,
  MouseLeftClickIcon,
  MouseRightClickIcon,
  MouseScrollIcon,
  MouseSimpleIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ModelLoadingStage } from "@/components/foundry/model-loading-stage";
import { PreviewSurface } from "@/components/skins/skin-preview-panel";
import { useSkinModelPreview } from "@/hooks/use-skin-model-preview";
import { type LocalMod, ModStatus } from "@/types/mods";

const CONTROLS = [
  { key: "orbit", Icon: MouseLeftClickIcon },
  { key: "pan", Icon: MouseRightClickIcon },
  { key: "zoom", Icon: MouseScrollIcon },
  { key: "focus", Icon: CursorClickIcon },
] as const;

interface Props {
  mod: ModDto;
  localMod?: LocalMod;
}

export const ModModelPreview = ({ mod, localMod }: Props) => {
  const { t } = useTranslation();
  const ready =
    localMod &&
    [
      ModStatus.Downloaded,
      ModStatus.Installed,
      ModStatus.FailedToInstall,
    ].includes(localMod.status);
  const busy =
    localMod &&
    [
      ModStatus.Downloading,
      ModStatus.Extracting,
      ModStatus.Paused,
      ModStatus.Installing,
    ].includes(localMod.status);
  return (
    <section className='overflow-hidden rounded-lg border bg-card'>
      <div className='flex items-center gap-3 px-5 py-3.5'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-md bg-muted'>
          <CubeIcon className='size-4 text-primary' weight='duotone' />
        </span>
        <div className='min-w-0 flex-1'>
          <h3 className='font-semibold text-sm'>{t("modelPreview.title")}</h3>
          <p className='truncate text-muted-foreground text-xs'>{mod.name}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size='sm'
              variant='ghost'
              className='h-8 gap-1.5 px-2.5 text-muted-foreground text-xs hover:text-foreground'>
              <MouseSimpleIcon className='size-4' />
              {t("modelPreview.controlsHelp")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side='left' className='p-3'>
            <ul className='space-y-1.5 text-xs'>
              {CONTROLS.map(({ key, Icon }) => (
                <li className='flex items-center gap-2' key={key}>
                  <Icon aria-hidden className='size-4 opacity-70' />
                  {t(`modelPreview.controls.${key}`)}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </div>
      {ready ? (
        <LocalPreview
          key={`${localMod.remoteId}:${localMod.activeVariantArchive ?? ""}`}
          mod={localMod}
        />
      ) : (
        // The stage the model will load on, already holding the hero, so
        // installing carries straight on into the preview.
        <div className='relative h-[640px] min-h-[360px] border-t'>
          <ModelLoadingStage
            hero={localMod?.hero ?? mod.hero}
            idle={!busy}
            status={t(
              busy
                ? "modelPreview.downloadBusy"
                : "modelPreview.downloadFirstHint",
            )}
          />
        </div>
      )}
    </section>
  );
};

const LocalPreview = ({ mod }: { mod: LocalMod }) => {
  const preview = useSkinModelPreview(mod.hero ?? "", mod);
  return (
    <div className='relative h-[640px] min-h-[360px] border-t'>
      <PreviewSurface hero={mod.hero} preview={preview} label={mod.name} />
    </div>
  );
};
