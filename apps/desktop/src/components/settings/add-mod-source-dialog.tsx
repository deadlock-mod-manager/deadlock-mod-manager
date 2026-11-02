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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addNativeSource,
  NATIVE_SOURCES_QUERY_KEY,
  previewNativeSource,
} from "@/lib/mod-sources";

interface AddModSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddModSourceDialog = ({
  open,
  onOpenChange,
}: AddModSourceDialogProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const preview = useMutation({
    mutationFn: previewNativeSource,
    meta: { skipGlobalErrorHandler: true },
  });
  const add = useMutation({
    mutationFn: addNativeSource,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: NATIVE_SOURCES_QUERY_KEY,
      });
      onOpenChange(false);
    },
    meta: { skipGlobalErrorHandler: true },
  });
  const validated = preview.variables === url.trim() ? preview.data : undefined;
  const busy = preview.isPending || add.isPending;
  const error = add.error ?? preview.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modSources.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("modSources.addDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (validated)
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
              disabled={busy || !url.trim()}
              isLoading={busy}>
              {validated ? t("modSources.add") : t("modSources.preview")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
