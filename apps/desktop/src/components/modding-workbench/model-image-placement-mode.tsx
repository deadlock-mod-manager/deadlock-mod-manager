import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { useTranslation } from "react-i18next";

export type ImagePlacementMode = "projection" | "uv";

export function ModelImagePlacementMode({
  value,
  disabled,
  onChange,
}: {
  value: ImagePlacementMode;
  disabled: boolean;
  onChange: (value: ImagePlacementMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className='space-y-1.5'>
      <p className='text-[11px] text-muted-foreground'>
        {t("modelEditor.paint.imagePlacement")}
      </p>
      <ToggleGroup
        type='single'
        value={value}
        disabled={disabled}
        aria-label={t("modelEditor.paint.imagePlacement")}
        className='w-full gap-1 rounded-md border bg-muted/40 p-1'
        onValueChange={(next) => {
          if (next === "projection" || next === "uv") onChange(next);
        }}>
        <ToggleGroupItem
          value='projection'
          className='h-8 min-w-0 flex-1 rounded px-2 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm'>
          {t("modelEditor.paint.imageSticker")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value='uv'
          className='h-8 min-w-0 flex-1 rounded px-2 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm'>
          {t("modelEditor.paint.imageWrap")}
        </ToggleGroupItem>
      </ToggleGroup>
      <p className='text-[11px] leading-relaxed text-muted-foreground'>
        {t(
          value === "projection"
            ? "modelEditor.paint.imageStickerHint"
            : "modelEditor.paint.imageWrapHint",
        )}
      </p>
    </div>
  );
}
