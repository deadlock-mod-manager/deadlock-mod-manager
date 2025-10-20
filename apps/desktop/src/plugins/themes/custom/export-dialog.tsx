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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { usePersistedStore } from "@/lib/store";
import type { CustomExportedTheme, ThemeSettings } from "./types";

export const ExportCustomThemeButton = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const settings = usePersistedStore((s) => s.pluginSettings["themes"]) as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);
  const current: ThemeSettings = settings ?? {
    activeSection: "custom",
    activeTheme: "custom",
    customTheme: {
      lineColor: "#6b7280",
      backgroundSource: "url",
      backgroundUrl: "",
      backgroundData: "",
      backgroundOpacity: 30,
      iconData: "",
    },
    userThemes: [],
  };

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const [previewData, setPreviewData] = useState<string>("");

  const canSave = name.trim().length > 0;

  const handleFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreviewData(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const id = uuidv4();
    const c = current.customTheme ?? {
      lineColor: "#6b7280",
      backgroundSource: "url" as const,
      backgroundUrl: "",
      backgroundData: "",
      backgroundOpacity: 30,
    };
    const next: CustomExportedTheme = {
      id,
      name: name.trim(),
      description: description.trim() || undefined,
      subDescription: subDescription.trim() || undefined,
      previewData: previewData || undefined,
      lineColor: c.lineColor,
      iconData: c.iconData,
      backgroundSource: c.backgroundSource,
      backgroundUrl: c.backgroundUrl,
      backgroundData: c.backgroundData,
      backgroundOpacity: c.backgroundOpacity,
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
    setPreviewData("");
  };

  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t("plugins.themes.exportAsPreDefined")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-[520px]'>
          <DialogHeader>
            <DialogTitle>{t("plugins.themes.exportCustomTheme")}</DialogTitle>
            <DialogDescription>
              {t("plugins.themes.exportCustomThemeDescription")}
            </DialogDescription>
          </DialogHeader>

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
              <Label htmlFor='theme-description'>{t("plugins.themes.description")}</Label>
              <Textarea
                id='theme-description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("plugins.themes.descriptionPlaceholder")}
                rows={2}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='theme-sub-description'>{t("plugins.themes.subDescription")}</Label>
              <Input
                id='theme-sub-description'
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder={t("plugins.themes.subDescriptionPlaceholder")}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label>{t("plugins.themes.previewImage")}</Label>
              <div className='flex items-center gap-3'>
                <input
                  accept='image/*'
                  id='export-theme-preview-input'
                  type='file'
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  variant='outline'
                  onClick={() =>
                    document
                      .getElementById("export-theme-preview-input")
                      ?.click()
                  }>
                  {t("plugins.themes.choosePreview")}
                </Button>
                {previewData ? (
                  <img
                    src={previewData}
                    alt='preview'
                    className='h-10 w-16 object-cover rounded'
                  />
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              {t("plugins.themes.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {t("plugins.themes.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
