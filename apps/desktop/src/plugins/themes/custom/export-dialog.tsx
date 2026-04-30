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
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { toPng } from "html-to-image";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { usePersistedStore } from "@/lib/store";
import { DEFAULT_CUSTOM_THEME } from "./theme-defaults";
import type {
  CustomExportedTheme,
  CustomThemePalette,
  ThemeSettings,
} from "./types";
import { mergeCustomThemePalette } from "./utils";
import { ThemePreviewSkeleton } from "./theme-preview-skeleton";

function themeGradientPlaceholderDataUrl(palette: CustomThemePalette): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${palette.cardColor}"/><stop offset="100%" stop-color="${palette.accentColor}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const ExportCustomThemeButton = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const settings = usePersistedStore((s) => s.pluginSettings.themes) as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);
  const current: ThemeSettings = settings ?? {
    activeSection: "custom",
    customTheme: DEFAULT_CUSTOM_THEME,
    userThemes: [],
  };

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const savingRef = useRef(false);

  const canSave = name.trim().length > 0;

  const capturePreview = useCallback(async (): Promise<string | undefined> => {
    const node = snapshotRef.current;
    if (node === null) {
      return undefined;
    }
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
    });
    return dataUrl;
  }, []);

  const handleSave = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    void (async () => {
      const palette = mergeCustomThemePalette(current.customTheme);
      setCaptureBusy(true);
      let previewData: string | undefined;
      try {
        previewData = await capturePreview();
      } catch {
        previewData = undefined;
      } finally {
        setCaptureBusy(false);
        savingRef.current = false;
      }

      const resolvedPreview =
        previewData ?? themeGradientPlaceholderDataUrl(palette);

      const id = uuidv4();
      const next: CustomExportedTheme = {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        subDescription: subDescription.trim() || undefined,
        previewData: resolvedPreview,
        ...palette,
        userCreated: true,
      };

      const list = Array.isArray(current.userThemes) ? current.userThemes : [];
      setSettings("themes", {
        ...current,
        userThemes: [next, ...list],
      });
      setOpen(false);
      setName("");
      setDescription("");
      setSubDescription("");
    })();
  };

  const draftPalette = mergeCustomThemePalette(current.customTheme);

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t("plugins.themes.exportAsPreDefined")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-[560px]'>
          <DialogHeader>
            <DialogTitle>{t("plugins.themes.exportCustomTheme")}</DialogTitle>
            <DialogDescription>
              {t("plugins.themes.exportCustomThemeDescription")}
            </DialogDescription>
          </DialogHeader>

          <div
            ref={snapshotRef}
            className='aspect-[16/10] w-full overflow-hidden rounded-lg border border-border/70 bg-muted/25 p-2'>
            <ThemePreviewSkeleton palette={draftPalette} />
          </div>

          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='theme-name'>{t("plugins.themes.name")}</Label>
              <Input
                id='theme-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("plugins.themes.namePlaceholder")}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='theme-description'>
                {t("plugins.themes.description")}
              </Label>
              <Textarea
                id='theme-description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("plugins.themes.descriptionPlaceholder")}
                rows={2}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='theme-sub-description'>
                {t("plugins.themes.subDescription")}
              </Label>
              <Input
                id='theme-sub-description'
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder={t("plugins.themes.subDescriptionPlaceholder")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              {t("plugins.themes.cancel")}
            </Button>
            <Button
              disabled={!canSave || captureBusy}
              onClick={handleSave}
              type='button'>
              {t("plugins.themes.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
