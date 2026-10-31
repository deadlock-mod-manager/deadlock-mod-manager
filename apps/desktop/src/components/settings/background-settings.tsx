import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingRow,
  SettingToggleRow,
} from "@/components/settings/setting-row";
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
    <div className='flex flex-col gap-4'>
      <SettingRow
        description={t("settings.backgroundImageDescription")}
        title={t("settings.backgroundImage")}>
        <Input
          aria-label={t("settings.backgroundImage")}
          className='w-64'
          onChange={(event) =>
            updateAppBackground({ image: event.target.value })
          }
          placeholder={t(
            isLocalImage(background.image)
              ? "settings.backgroundLocalImage"
              : "settings.backgroundImagePlaceholder",
          )}
          value={isLocalImage(background.image) ? "" : background.image}
        />
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
        <Button onClick={() => fileInputRef.current?.click()} variant='outline'>
          <ImageIcon />
          {t("settings.backgroundChooseImage")}
        </Button>
        {hasImage && (
          <Button
            aria-label={t("settings.backgroundRemove")}
            onClick={() => updateAppBackground({ image: "" })}
            size='icon'
            variant='outline'>
            <TrashIcon />
          </Button>
        )}
      </SettingRow>

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

      <SettingToggleRow
        checked={background.includeSidebar}
        description={t("settings.backgroundIncludeSidebarDescription")}
        disabled={!hasImage}
        id='toggle-background-include-sidebar'
        onCheckedChange={(includeSidebar) =>
          updateAppBackground({ includeSidebar })
        }
        title={t("settings.backgroundIncludeSidebar")}
      />
    </div>
  );
};

export default BackgroundSettings;
