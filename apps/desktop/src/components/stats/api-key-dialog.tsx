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
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";

const PATREON_URL = "https://deadlock-api.com/patron";

interface ApiKeyDialogProps {
  open: boolean;
  currentKey: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (key: string | null) => void;
}

/**
 * deadlock-api hands out keys on its website after a Patreon sign-in, so the app
 * takes the finished key rather than running the OAuth flow itself.
 */
export const ApiKeyDialog = ({
  open,
  currentKey,
  onOpenChange,
  onSave,
}: ApiKeyDialogProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentKey ?? "");

  useEffect(() => {
    if (open) {
      setValue(currentKey ?? "");
    }
  }, [open, currentKey]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave(value.trim() || null);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t("stats.apiKey.title")}</DialogTitle>
          <DialogDescription>{t("stats.apiKey.description")}</DialogDescription>
        </DialogHeader>

        <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='deadlock-api-key'>{t("stats.apiKey.label")}</Label>
            <Input
              autoComplete='off'
              id='deadlock-api-key'
              onChange={(event) => setValue(event.target.value)}
              placeholder={t("stats.apiKey.placeholder")}
              spellCheck={false}
              type='password'
              value={value}
            />
            <p className='text-muted-foreground text-xs'>
              {t("stats.apiKey.hint")}
            </p>
          </div>

          <Button
            className='w-fit px-0'
            onClick={() => void openUrl(PATREON_URL)}
            type='button'
            variant='link'>
            {t("stats.apiKey.getKey")}
            <ExternalLink className='h-3.5 w-3.5' />
          </Button>

          <DialogFooter className='gap-2'>
            {currentKey && (
              <Button
                onClick={() => {
                  onSave(null);
                  onOpenChange(false);
                }}
                type='button'
                variant='outline'>
                {t("stats.apiKey.remove")}
              </Button>
            )}
            <Button type='submit'>{t("stats.apiKey.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
