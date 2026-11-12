import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { SparkleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { ParticlePreviewControls } from "@/lib/particles/effect";
import type { ParticleDiagnostic } from "@/lib/particles/types";
import type { PreviewEffectChoice } from "@/types/generated/PreviewEffectChoice";
import { SwitchRow } from "./viewer-switch-row";

interface Props {
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  choices: PreviewEffectChoice[];
  selected: string | null;
  onSelect: (path: string | null) => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  controls: ParticlePreviewControls;
  onControls: (controls: ParticlePreviewControls) => void;
  paths: string[];
  diagnostics: ParticleDiagnostic[];
}

export function ViewerParticlePicker({
  enabled,
  onEnabled,
  choices,
  selected,
  onSelect,
  loading,
  failed,
  onRetry,
  controls,
  onControls,
  paths,
  diagnostics,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const inputsDisabled = !controls.inputsEnabled || selected === null;
  const matchingChoices = choices.filter(
    (choice) =>
      choice.path === selected ||
      `${choice.path} ${choice.ability ?? ""} ${choice.field ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size='sm'
          variant={enabled ? "secondary" : "ghost"}
          className='h-8 gap-1.5 px-2 text-xs'>
          <SparkleIcon />
          {t("modelPreview.effects")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='max-h-[70vh] w-80 space-y-3 overflow-y-auto p-3 text-xs'>
        <SwitchRow
          icon={SparkleIcon}
          label={t("modelPreview.effects")}
          checked={enabled}
          onCheckedChange={onEnabled}
        />
        <p className='text-muted-foreground'>
          {t("modelPreview.effectsPreviewOnly")}
        </p>
        <input
          type='search'
          aria-label={t("modelPreview.searchEffects")}
          placeholder={t("modelPreview.searchEffects")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className='h-8 w-full rounded-md border bg-background px-2 text-xs'
        />
        <Select
          value={selected ?? "automatic"}
          onValueChange={(path) => onSelect(path === "automatic" ? null : path)}
          disabled={!enabled}>
          <SelectTrigger
            aria-label={t("modelPreview.effectPicker")}
            className='h-8 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='automatic'>
              {t("modelPreview.automaticEffects")}
            </SelectItem>
            {matchingChoices.map((choice) => (
              <SelectItem
                key={choice.path}
                value={choice.path}
                title={`${choice.ability ?? ""} ${choice.field ?? ""}`}>
                {choice.path
                  .split("/")
                  .pop()
                  ?.replace(/\.vpcf(_c)?$/, "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <p role='status'>{t("modelPreview.loadingEffects")}</p>}
        {failed && (
          <p role='alert'>
            {t("modelPreview.effectsFailed")}{" "}
            <button type='button' className='underline' onClick={onRetry}>
              {t("skins.preview.retry")}
            </button>
          </p>
        )}
        {enabled && (
          <>
            <Select
              value={controls.isolatedPath ?? "all"}
              onValueChange={(path) =>
                onControls({
                  ...controls,
                  isolatedPath: path === "all" ? null : path,
                })
              }>
              <SelectTrigger
                aria-label={t("modelPreview.isolateEmitter")}
                className='h-8 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t("modelPreview.allEmitters")}
                </SelectItem>
                {paths.map((path) => (
                  <SelectItem key={path} value={path}>
                    {path.split("/").pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className='flex items-center justify-between gap-2'>
              <span>{t("modelPreview.effectMarkers")}</span>
              <input
                type='checkbox'
                checked={controls.markers}
                onChange={(event) =>
                  onControls({ ...controls, markers: event.target.checked })
                }
              />
            </label>
            <details className='space-y-2'>
              <summary className='cursor-pointer text-muted-foreground'>
                {t("modelPreview.effectInputs")}
              </summary>
              <p className='pt-2 text-muted-foreground'>
                {t("modelPreview.effectBindingsHint")}
              </p>
              <label className='flex items-center justify-between gap-2'>
                <span>{t("modelPreview.overrideInputs")}</span>
                <input
                  type='checkbox'
                  disabled={selected === null}
                  checked={controls.inputsEnabled ?? false}
                  onChange={(event) =>
                    onControls({
                      ...controls,
                      inputsEnabled: event.target.checked,
                    })
                  }
                />
              </label>
              <fieldset
                disabled={inputsDisabled}
                className='space-y-3 disabled:opacity-50'>
                <div className='flex items-center justify-between'>
                  <span>{t("modelPreview.charge")}</span>
                  <output>{Math.round(controls.charge * 100)}%</output>
                </div>
                <Slider
                  aria-label={t("modelPreview.charge")}
                  disabled={inputsDisabled}
                  min={0}
                  max={1}
                  step={0.01}
                  value={[controls.charge]}
                  onValueChange={([charge]) =>
                    charge !== undefined &&
                    onControls({ ...controls, charge, released: false })
                  }
                />
                <div className='grid grid-cols-2 gap-2'>
                  <label>
                    {t("modelPreview.chargeControlPoint")}
                    <input
                      className='mt-1 w-full rounded border bg-background px-2 py-1'
                      type='number'
                      min={0}
                      max={63}
                      value={controls.chargeControlPoint ?? 1}
                      onChange={(event) =>
                        onControls({
                          ...controls,
                          chargeControlPoint: Math.min(
                            63,
                            Math.max(0, Math.round(Number(event.target.value))),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("modelPreview.targetControlPoint")}
                    <input
                      className='mt-1 w-full rounded border bg-background px-2 py-1'
                      type='number'
                      min={0}
                      max={63}
                      value={controls.targetControlPoint ?? 10}
                      onChange={(event) =>
                        onControls({
                          ...controls,
                          targetControlPoint: Math.min(
                            63,
                            Math.max(0, Math.round(Number(event.target.value))),
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <div className='grid grid-cols-3 gap-2'>
                  {controls.target.map((value, index) => (
                    <label key={["X", "Y", "Z"][index]}>
                      {t("modelPreview.targetAxis", {
                        axis: ["X", "Y", "Z"][index],
                      })}
                      <input
                        className='mt-1 w-full rounded border bg-background px-2 py-1'
                        type='number'
                        min={-1000}
                        max={1000}
                        value={value}
                        onChange={(event) => {
                          const target: [number, number, number] = [
                            ...controls.target,
                          ];
                          target[index] = Math.min(
                            1000,
                            Math.max(-1000, Number(event.target.value)),
                          );
                          onControls({ ...controls, target });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                size='sm'
                variant='secondary'
                className='h-7 w-full text-xs'
                disabled={controls.released || selected === null}
                onClick={() => onControls({ ...controls, released: true })}>
                {t("modelPreview.releaseEffect")}
              </Button>
            </details>
          </>
        )}
        {diagnostics.length > 0 && (
          <details>
            <summary className='cursor-pointer text-amber-400'>
              {t("modelPreview.effectDiagnostics", {
                count: diagnostics.length,
              })}
            </summary>
            <ul className='mt-2 max-h-48 space-y-2 overflow-y-auto'>
              {diagnostics.slice(0, 64).map((diagnostic) => (
                <li
                  key={`${diagnostic.path}:${diagnostic.className}:${diagnostic.stage}:${diagnostic.detail}:${diagnostic.code}`}
                  className='break-words'>
                  <p>{t(`modelPreview.particleIssues.${diagnostic.code}`)}</p>
                  <p className='text-[10px] text-muted-foreground'>
                    {diagnostic.path.split("/").pop()} ·{" "}
                    {diagnostic.className || diagnostic.stage}
                    {diagnostic.detail ? ` · ${diagnostic.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </PopoverContent>
    </Popover>
  );
}
