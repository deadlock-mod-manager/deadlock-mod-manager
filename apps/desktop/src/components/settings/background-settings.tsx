import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BackgroundCoverageSettings } from "@/components/settings/background-coverage-settings";
import { SettingRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

const isLocalImage = (image: string) => image.startsWith("data:");

const BackgroundSettings = () => {
  const { t } = useTranslation();
  const background = usePersistedStore((state) => state.appBackground);
  const updateAppBackground = usePersistedStore(
    (state) => state.updateAppBackground,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasImage = background.image !== "";

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      updateAppBackground({ image: String(reader.result) }),
    );
    reader.readAsDataURL(file);
  };

  return (
    <div className='space-y-6'>
      <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]'>
        <div className='relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted/30'>
          {hasImage ? (
            <img
              alt={t("plugins.themes.customBackgroundAlt")}
              className='absolute inset-0 h-full w-full object-cover'
              src={background.image}
              style={{
                opacity: background.opacity / 100,
                filter: `blur(${background.blur}px)`,
              }}
            />
          ) : (
            <ImageIcon className='size-10 text-muted-foreground' />
          )}
          {hasImage && (
            <Button
              aria-label={t("settings.backgroundRemove")}
              className='absolute top-2 right-2'
              onClick={() => updateAppBackground({ image: "" })}
              size='icon'
              title={t("settings.backgroundRemove")}
              variant='outline'>
              <TrashIcon />
            </Button>
          )}
        </div>
        <div className='flex min-w-0 flex-col justify-center gap-4'>
          <div className='space-y-1'>
            <p className='font-medium text-sm'>
              {t("settings.backgroundImage")}
            </p>
            <p
              className='text-sm text-muted-foreground'
              id='background-image-description'>
              {t("settings.backgroundImageDescription")}
            </p>
          </div>
          <div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant='outline'>
              <ImageIcon />
              {t("settings.backgroundChooseImage")}
            </Button>
            {isLocalImage(background.image) && (
              <p className='mt-2 text-sm text-muted-foreground'>
                {t("settings.backgroundLocalImage")}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='background-image-url'>
              {t("settings.backgroundImageUrl")}
            </Label>
            <Input
              aria-describedby='background-image-description'
              id='background-image-url'
              className='w-full'
              onChange={(event) =>
                updateAppBackground({ image: event.target.value })
              }
              placeholder={t("settings.backgroundImagePlaceholder")}
              value={isLocalImage(background.image) ? "" : background.image}
            />
          </div>
        </div>
      </div>
      <input
        accept='image/*'
        className='hidden'
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type='file'
      />
      <div className='grid gap-8 border-t pt-5 xl:grid-cols-2'>
        <div className='space-y-5'>
          <p className='font-medium text-sm'>
            {t("settings.backgroundAdjustments")}
          </p>
          <SettingRow title={t("settings.backgroundOpacity")}>
            <div className='flex min-w-48 items-center gap-4'>
              <Slider
                aria-label={t("settings.backgroundOpacity")}
                className='flex-1'
                disabled={!hasImage}
                max={100}
                min={0}
                onValueChange={([opacity]) => updateAppBackground({ opacity })}
                step={1}
                value={[background.opacity]}
              />
              <span className='min-w-[2.5rem] text-right font-medium text-sm'>
                {background.opacity}%
              </span>
            </div>
          </SettingRow>

          <SettingRow title={t("settings.backgroundBlur")}>
            <div className='flex min-w-48 items-center gap-4'>
              <Slider
                aria-label={t("settings.backgroundBlur")}
                className='flex-1'
                disabled={!hasImage}
                max={20}
                min={0}
                onValueChange={([blur]) => updateAppBackground({ blur })}
                step={1}
                value={[background.blur]}
              />
              <span className='min-w-[2.5rem] text-right font-medium text-sm'>
                {background.blur}px
              </span>
            </div>
          </SettingRow>
        </div>
        <BackgroundCoverageSettings />
      </div>
    </div>
  );
};

export default BackgroundSettings;
