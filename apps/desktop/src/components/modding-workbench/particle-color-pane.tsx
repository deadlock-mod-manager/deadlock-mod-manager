import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { Input } from "@deadlock-mods/ui/components/input";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { PaletteIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  particleHex,
  particleRgb,
  type ParticleColorDraft,
  type ParticleColorGroup,
  type planParticleColors,
} from "@/lib/particle-colors";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticleList } from "./particle-list";
import { ParticlePalettes } from "./particle-palettes";
import { ParticleColorSampler } from "./particle-color-sampler";
import { ParticleColorProposal } from "./particle-color-proposal";

interface Props {
  file: ModdingParticleFile | undefined;
  files: ModdingParticleFile[];
  shared: boolean;
  busy: boolean;
  draft: ParticleColorDraft;
  groups: ParticleColorGroup[];
  plan: ReturnType<typeof planParticleColors>;
  onDraft: (draft: ParticleColorDraft) => void;
  onApply: () => void;
  onPickPreview: () => void;
}

export function ParticleColorPane({
  file,
  files,
  shared,
  busy,
  draft,
  groups,
  plan,
  onDraft,
  onApply,
  onPickPreview,
}: Props) {
  const { t } = useTranslation();
  const group = groups.find((group) => group.hex === draft.selection);
  const color = file?.colors.find((color) => color.path === draft.selection);
  const before = shared
    ? group?.hex
    : color
      ? particleHex(color.rgb)
      : undefined;
  const rgb = particleRgb(draft.hex);
  const proposed = plan.edits.length > 0;
  const rows = shared
    ? groups.map((group) => ({
        id: group.hex,
        label: group.hex,
        hex: group.hex,
        detail: t("particleColors.matches", {
          count: group.fields.length,
          files: group.files.length,
        }),
      }))
    : (file?.colors ?? []).map((color) => ({
        id: color.path,
        label: color.path.split("/").at(-1) ?? color.path,
        hex: particleHex(color.rgb),
        detail: color.path,
      }));
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      {shared ? (
        <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
          <span className='text-xs font-medium'>
            {t("particleColors.selectedFiles", { count: files.length })}
          </span>
          <Button
            size='sm'
            variant={draft.all ? "secondary" : "outline"}
            disabled={busy || !files.length}
            onClick={() => onDraft({ ...draft, all: !draft.all })}>
            {t("particleColors.reviewAll", { count: files.length })}
          </Button>
        </div>
      ) : null}
      <div className='flex min-h-0 flex-1 flex-col overflow-auto md:flex-row'>
        <div className='flex min-h-48 min-w-0 flex-1 flex-col border-r'>
          {shared ? (
            <details className='shrink-0 border-b px-3 py-2 text-xs text-muted-foreground'>
              <summary className='cursor-pointer'>
                {t("particleColors.tolerance")} <span>{draft.threshold}%</span>
              </summary>
              <Slider
                aria-label={t("particleColors.tolerance")}
                min={0}
                max={100}
                step={1}
                value={[draft.threshold]}
                disabled={busy}
                onValueChange={([threshold]) =>
                  onDraft({
                    ...draft,
                    threshold: threshold ?? 0,
                    selection: "",
                  })
                }
                className='my-3'
              />
              <p>{t("particleColors.toleranceHint")}</p>
            </details>
          ) : null}
          {rows.length ? (
            <ParticleList
              items={rows}
              active={draft.selection}
              label={t(
                shared ? "particleColors.shared" : "particleColors.fields",
              )}
              disabled={busy}
              onSelect={(id) => {
                const row = rows.find((row) => row.id === id);
                if (row)
                  onDraft({
                    ...draft,
                    selection: id,
                    hex: row.hex,
                    all: false,
                  });
              }}
            />
          ) : (
            <p className='p-4 text-sm text-muted-foreground'>
              {t(
                shared ? "particleColors.noShared" : "particleColors.noColors",
              )}
            </p>
          )}
        </div>
        <div className='flex min-h-0 w-full shrink-0 flex-col md:w-72'>
          {draft.selection || draft.all ? (
            <>
              <div className='min-h-0 flex-1 space-y-3 overflow-auto p-3'>
                <p className='text-xs font-medium'>
                  {t(
                    draft.all
                      ? "particleColors.allFieldsMode"
                      : shared
                        ? "particleColors.matchingMode"
                        : "particleColors.singleFieldMode",
                  )}
                </p>
                <fieldset
                  disabled={busy || (!draft.selection && !draft.all)}
                  className='space-y-3'>
                  <ColorPicker
                    value={draft.hex}
                    onChange={(hex) => onDraft({ ...draft, hex })}
                    showEyedropper={false}
                    labels={{
                      red: t("particleColors.red"),
                      green: t("particleColors.green"),
                      blue: t("particleColors.blue"),
                    }}
                  />
                  <div className='flex gap-2'>
                    <Input
                      aria-label={t("particleColors.hex")}
                      value={draft.hex}
                      onChange={(event) =>
                        onDraft({ ...draft, hex: event.target.value })
                      }
                      className='font-mono text-xs'
                    />
                    <ParticleColorSampler
                      busy={busy || (!draft.selection && !draft.all)}
                      onPick={(hex) => onDraft({ ...draft, hex })}
                      onPickPreview={onPickPreview}
                    />
                  </div>
                  {!rgb ? (
                    <p role='alert' className='text-xs text-destructive'>
                      {t("particleColors.invalidHex")}
                    </p>
                  ) : null}
                  {!proposed ? (
                    <p className='text-xs text-muted-foreground'>
                      {t(
                        draft.all
                          ? "particleColors.chooseAllColor"
                          : draft.selection
                            ? "particleColors.chooseReplacement"
                            : "particleColors.selectColor",
                      )}
                    </p>
                  ) : null}
                </fieldset>
                <details className='border-t pt-2 text-xs text-muted-foreground'>
                  <summary className='cursor-pointer'>
                    {t("particleColors.palettes")}
                  </summary>
                  <div className='pt-2'>
                    <ParticlePalettes
                      validColor={!!rgb}
                      color={rgb ? particleHex(rgb) : "#ff8800"}
                      onSelect={(hex) => onDraft({ ...draft, hex })}
                    />
                  </div>
                </details>
              </div>
              {proposed ? (
                <ParticleColorProposal
                  before={before}
                  hex={draft.hex}
                  all={draft.all}
                  plan={plan}
                  busy={busy}
                  invalid={files.some((file) => !!file.diagnostic)}
                  onApply={onApply}
                  onDiscard={() =>
                    onDraft({
                      ...draft,
                      hex: before ?? draft.hex,
                      selection: before ? draft.selection : "",
                      all: false,
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <div
              className='flex h-full min-h-48 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground'
              role='status'>
              <PaletteIcon
                aria-hidden
                weight='duotone'
                className='size-8 opacity-50'
              />
              <p className='max-w-40 text-xs'>
                {t("particleColors.selectColor")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
