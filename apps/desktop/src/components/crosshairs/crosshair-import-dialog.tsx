import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { Download } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  mergeCrosshairConfig,
  parseCitadelCrosshairFormat,
} from "@/lib/crosshair-import";

interface CrosshairImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (config: CrosshairConfig) => void;
}

export const CrosshairImportDialog = ({
  open,
  onOpenChange,
  onImport,
}: CrosshairImportDialogProps) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    setError(null);

    if (!input.trim()) {
      setError(t("crosshairs.form.import.emptyError"));
      return;
    }

    const result = parseCitadelCrosshairFormat(input);

    if (!result.success || !result.config) {
      setError(result.error || t("crosshairs.form.import.parseError"));
      return;
    }

    const mergedConfig = mergeCrosshairConfig(result.config);
    onImport(mergedConfig);
    toast.success(t("crosshairs.form.import.success"));
    setInput("");
    setError(null);
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInput("");
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t("crosshairs.form.import.title")}</DialogTitle>
          <DialogDescription>
            {t("crosshairs.form.import.description")}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder={t("crosshairs.form.import.placeholder")}
            rows={6}
            className='font-mono text-sm'
          />
          {error && <div className='text-sm text-destructive'>{error}</div>}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            icon={<Download className='h-4 w-4' />}
            onClick={handleImport}>
            {t("crosshairs.form.import.button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
