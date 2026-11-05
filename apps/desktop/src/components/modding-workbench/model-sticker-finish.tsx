import { Button } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import { ModelEditorNumber } from "./model-editor-number";

export function ModelStickerFinish({
  selected,
  busy,
  onChange: change,
}: {
  selected: ModdingModelPatch;
  busy: boolean;
  onChange: (patch: ModdingModelPatch) => void;
}) {
  const { t } = useTranslation();
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ) => (
    <ModelEditorNumber
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={busy}
      onChange={onChange}
    />
  );
  return (
    <div className='space-y-4'>
      <h4 className='text-xs font-medium'>
        {t("modelEditor.inspector.stickerFinish")}
      </h4>
      <div className='space-y-3'>
        <div className='flex gap-1'>
          {(["printed", "badge", "display"] satisfies string[]).map(
            (preset) => (
              <Button
                key={preset}
                size='sm'
                variant='outline'
                className='flex-1 px-1 text-xs aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground'
                aria-pressed={
                  selected.roughness === (preset === "display" ? 0.3 : 0.75) &&
                  selected.glow === (preset === "display" ? 1 : 0) &&
                  selected.thickness === (preset === "badge" ? 0.6 : 0.15)
                }
                disabled={busy}
                onClick={() =>
                  change({
                    ...selected,
                    roughness: preset === "display" ? 0.3 : 0.75,
                    glow: preset === "display" ? 1 : 0,
                    thickness: preset === "badge" ? 0.6 : 0.15,
                  })
                }>
                {t(`modelEditor.stickers.${preset}`)}
              </Button>
            ),
          )}
        </div>
        {number(
          "modelEditor.stickers.roughness",
          selected.roughness,
          0,
          1,
          0.05,
          (roughness) => change({ ...selected, roughness }),
        )}
        {number(
          "modelEditor.stickers.glow",
          selected.glow,
          0,
          10,
          0.1,
          (glow) => change({ ...selected, glow }),
        )}
        <label className='flex items-center justify-between gap-3 border-t pt-4 text-xs'>
          <span>{t("modelEditor.stickers.removeBackground")}</span>
          <Switch
            aria-label={t("modelEditor.stickers.removeBackground")}
            checked={Boolean(selected.background)}
            disabled={busy}
            onCheckedChange={(checked) =>
              change({
                ...selected,
                background: checked
                  ? {
                      color: "#000000",
                      tolerance: 0.02,
                      softness: 0.01,
                      gapProtection: 0.01,
                      edgeConnected: true,
                    }
                  : null,
              })
            }
          />
        </label>
        {selected.background && (
          <>
            <label className='flex items-center justify-between text-xs'>
              <span>{t("modelEditor.stickers.backgroundColor")}</span>
              <input
                type='color'
                aria-label={t("modelEditor.stickers.backgroundColor")}
                className='h-8 w-16 cursor-pointer rounded-md border border-input bg-background p-1'
                value={selected.background.color}
                disabled={busy}
                onChange={(event) => {
                  if (selected.background)
                    change({
                      ...selected,
                      background: {
                        ...selected.background,
                        color: event.target.value,
                      },
                    });
                }}
              />
            </label>
            <label className='flex items-center justify-between gap-3 text-xs'>
              <span>{t("modelEditor.stickers.edgeConnected")}</span>
              <Switch
                aria-label={t("modelEditor.stickers.edgeConnected")}
                checked={selected.background.edgeConnected ?? true}
                disabled={busy}
                onCheckedChange={(checked) => {
                  if (selected.background)
                    change({
                      ...selected,
                      background: {
                        ...selected.background,
                        edgeConnected: checked,
                      },
                    });
                }}
              />
            </label>
            {(selected.background.edgeConnected ?? true) && (
              <>
                {number(
                  "modelEditor.stickers.gapProtection",
                  (selected.background.gapProtection ?? 0.01) * 100,
                  0,
                  5,
                  0.25,
                  (value) => {
                    if (selected.background)
                      change({
                        ...selected,
                        background: {
                          ...selected.background,
                          gapProtection: value / 100,
                        },
                      });
                  },
                )}
                <details className='text-[11px] text-muted-foreground'>
                  <summary className='cursor-pointer'>
                    {t("modelEditor.inspector.guidance")}
                  </summary>
                  <p className='pt-2 leading-relaxed'>
                    {t("modelEditor.stickers.gapProtectionHint")}
                  </p>
                </details>
              </>
            )}
            {number(
              "modelEditor.stickers.tolerance",
              selected.background.tolerance,
              0,
              1,
              0.01,
              (tolerance) => {
                if (selected.background)
                  change({
                    ...selected,
                    background: { ...selected.background, tolerance },
                  });
              },
            )}
            {number(
              "modelEditor.stickers.softness",
              selected.background.softness,
              0,
              1,
              0.01,
              (softness) => {
                if (selected.background)
                  change({
                    ...selected,
                    background: { ...selected.background, softness },
                  });
              },
            )}
          </>
        )}
        <details className='border-t pt-3 text-[11px] text-muted-foreground'>
          <summary className='cursor-pointer'>
            {t("modelEditor.inspector.guidance")}
          </summary>
          <p className='pt-2 leading-relaxed'>
            {t("modelEditor.stickers.loopHint")}
          </p>
        </details>
      </div>
    </div>
  );
}
