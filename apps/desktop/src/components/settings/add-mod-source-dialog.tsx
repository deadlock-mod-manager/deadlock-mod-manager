import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addNativeSource,
  NATIVE_SOURCES_QUERY_KEY,
  previewNativeSource,
  setNativeSourceEnabled,
  useNativeSources,
} from "@/lib/mod-sources";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import { usePersistedStore } from "@/lib/store";

interface AddModSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filled in and previewed on open, as when a website's link opens this. */
  initialUrl?: string;
  /** The source ID a link expects, so a descriptor for another source is refused. */
  expectedSourceId?: string;
  /** Explains why a link opened the dialog. */
  reason?: string;
  onAdded?: (source: NativeSourceSummary) => void;
}

export const AddModSourceDialog = ({
  open,
  onOpenChange,
  initialUrl,
  expectedSourceId,
  reason,
  onAdded,
}: AddModSourceDialogProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(initialUrl ?? "");
  const { data: sources } = useNativeSources();
  const preview = useMutation({
    mutationFn: previewNativeSource,
    meta: { skipGlobalErrorHandler: true },
  });
  const finish = async (source: NativeSourceSummary) => {
    usePersistedStore.getState().markFeatureUsed("custom-mod-sources");
    await queryClient.invalidateQueries({
      queryKey: NATIVE_SOURCES_QUERY_KEY,
    });
    onAdded?.(source);
    onOpenChange(false);
  };
  const add = useMutation({
    mutationFn: addNativeSource,
    onSuccess: finish,
    meta: { skipGlobalErrorHandler: true },
  });
  const enable = useMutation({
    mutationFn: (sourceKey: string) => setNativeSourceEnabled(sourceKey, true),
    onSuccess: finish,
    meta: { skipGlobalErrorHandler: true },
  });
  // Runs once: a link's URL is previewed without the user pressing Preview,
  // but adding still waits for them.
  const previewInitial = preview.mutate;
  useEffect(() => {
    if (initialUrl) previewInitial(initialUrl);
  }, [initialUrl, previewInitial]);

  const validated = preview.variables === url.trim() ? preview.data : undefined;
  const existing = sources?.find((source) => source.key === validated?.key);
  const mismatched =
    !!validated &&
    expectedSourceId !== undefined &&
    validated.descriptor.sourceId !== expectedSourceId;
  const busy = preview.isPending || add.isPending || enable.isPending;
  const error = enable.error ?? add.error ?? preview.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modSources.addTitle")}</DialogTitle>
          <DialogDescription>
            {reason ?? t("modSources.addDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (existing) {
              if (existing.enabled) void finish(existing);
              else enable.mutate(existing.key);
            } else if (validated)
              add.mutate({
                descriptorUrl: validated.descriptorUrl,
                previewToken: validated.previewToken,
              });
            else preview.mutate(url.trim());
          }}>
          <div className='space-y-2'>
            <Label htmlFor='mod-source-url'>
              {t("modSources.descriptorUrl")}
            </Label>
            <Input
              id='mod-source-url'
              type='url'
              value={url}
              autoComplete='url'
              spellCheck={false}
              placeholder='https://mods.example.org/source.json'
              disabled={busy}
              required
              onChange={(event) => {
                setUrl(event.target.value);
                preview.reset();
                add.reset();
              }}
            />
          </div>
          {validated && (
            <div className='space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm'>
              <p className='font-medium'>{validated.descriptor.name}</p>
              <p className='break-all text-muted-foreground'>
                {validated.acceptedOrigin}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t("modSources.acceptOrigins")}
              </p>
              <ul className='space-y-1 text-xs'>
                {[
                  ...new Set([
                    ...validated.descriptor.networkOrigins.api,
                    ...validated.descriptor.networkOrigins.downloads,
                    ...validated.descriptor.networkOrigins.media,
                  ]),
                ].map((origin) => (
                  <li className='break-all' key={origin}>
                    {origin}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {existing && (
            <p className='text-sm text-muted-foreground'>
              {existing.enabled
                ? t("modSources.alreadyAdded", {
                    name: existing.descriptor.name,
                  })
                : t("modSources.alreadyAddedDisabled", {
                    name: existing.descriptor.name,
                  })}
            </p>
          )}
          {mismatched && (
            <p role='alert' className='text-sm text-destructive'>
              {t("modSources.linkSourceMismatch")}
            </p>
          )}
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type='submit'
              disabled={busy || !url.trim() || mismatched}
              isLoading={busy}>
              {existing
                ? existing.enabled
                  ? t("common.close")
                  : t("modSources.enableAction")
                : validated
                  ? t("modSources.add")
                  : t("modSources.preview")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
