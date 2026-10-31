import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ImageIcon, XIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  loadViewerBackground,
  type ViewerBackground,
} from "./viewer-background";
import { overlaySurface } from "./viewer-tool-types";

export const ViewerBackgroundButton = ({
  background,
  onBackgroundChange,
}: {
  background: ViewerBackground | null;
  onBackgroundChange: (background: ViewerBackground | null) => void;
}) => {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: loadViewerBackground,
    onSuccess: onBackgroundChange,
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <div className='flex flex-col items-start gap-1.5'>
      <div className={cn(overlaySurface, "flex h-8 items-center rounded-md")}>
        <input
          ref={fileInput}
          type='file'
          accept='image/png,image/jpeg,image/webp'
          className='sr-only'
          tabIndex={-1}
          aria-label={t("modelPreview.chooseBackground")}
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
        <Button
          size='sm'
          variant='ghost'
          className='h-full max-w-44 gap-1.5 px-2.5 text-xs'
          title={background?.name ?? t("modelPreview.chooseBackground")}
          isLoading={upload.isPending}
          onClick={() => fileInput.current?.click()}>
          <ImageIcon className='size-3.5' />
          <span className='truncate'>
            {background?.name ?? t("modelPreview.studio")}
          </span>
        </Button>
        {background && (
          <Button
            size='icon'
            variant='ghost'
            className='h-full w-7 rounded-l-none border-white/10 border-l'
            aria-label={t("modelPreview.clearBackground")}
            title={t("modelPreview.clearBackground")}
            disabled={upload.isPending}
            onClick={() => {
              upload.reset();
              onBackgroundChange(null);
            }}>
            <XIcon className='size-3' />
          </Button>
        )}
      </div>
      {upload.isError && (
        <p
          role='alert'
          className={cn(
            overlaySurface,
            "max-w-64 rounded-md px-2.5 py-1.5 text-destructive text-xs",
          )}>
          {t("modelPreview.backgroundFailed")}
        </p>
      )}
    </div>
  );
};
