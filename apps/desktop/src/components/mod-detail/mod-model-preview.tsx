import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  CubeIcon,
  CursorClickIcon,
  DownloadSimpleIcon,
  MouseLeftClickIcon,
  MouseRightClickIcon,
  MouseScrollIcon,
  MouseSimpleIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModelLoadingStage } from "@/components/foundry/model-loading-stage";
import { PreviewSurface } from "@/components/skins/skin-preview-panel";
import { queueModDownload } from "@/hooks/use-download";
import { useActiveProfileFolder } from "@/hooks/use-mod-health";
import { useSkinModelPreview } from "@/hooks/use-skin-model-preview";
import { formatSize } from "@/lib/utils";
import { type LocalMod, type ModDownloadItem, ModStatus } from "@/types/mods";

const CONTROLS = [
  { key: "orbit", Icon: MouseLeftClickIcon },
  { key: "pan", Icon: MouseRightClickIcon },
  { key: "zoom", Icon: MouseScrollIcon },
  { key: "focus", Icon: CursorClickIcon },
] as const;

interface Props {
  mod: ModDto;
  localMod?: LocalMod;
  files: ModDownloadItem[];
}

export const ModModelPreview = ({ mod, localMod, files }: Props) => {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState("");
  const profileFolder = useActiveProfileFolder();
  const file = files.find((item) => item.name === fileName) ?? files[0];
  const ready =
    localMod &&
    [
      ModStatus.Downloaded,
      ModStatus.Installed,
      ModStatus.FailedToInstall,
    ].includes(localMod.status);
  const download = useMutation({
    mutationFn: async (selected: ModDownloadItem) =>
      queueModDownload(mod, [selected], {
        allFiles: files,
        profileFolder,
        onError: (error) =>
          toast.error(
            t("downloads.downloadError", {
              name: mod.name,
              message: error.message,
            }),
          ),
      }),
    meta: { skipGlobalErrorHandler: true },
  });
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
        <div className='flex h-[640px] min-h-[360px] flex-col border-t'>
          <div className='relative min-h-0 flex-1'>
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
          {!busy && file && (
            <div className='flex flex-wrap items-center justify-center gap-3 px-6 pb-6'>
              <select
                aria-label={t("modelPreview.chooseFile")}
                value={file.name}
                onChange={(event) => setFileName(event.target.value)}
                className='h-9 min-w-0 max-w-full rounded-md border bg-background px-3 text-sm'>
                {files.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({formatSize(item.size)})
                  </option>
                ))}
              </select>
              <Button
                size='sm'
                disabled={download.isPending}
                onClick={() => download.mutate(file)}>
                <DownloadSimpleIcon className='mr-2 h-4 w-4' />
                {t("modelPreview.download")}
              </Button>
            </div>
          )}
          {download.isError && (
            <p
              role='alert'
              className='px-6 pb-6 text-center text-destructive text-sm'>
              {t("modelPreview.downloadFailed")}
            </p>
          )}
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
