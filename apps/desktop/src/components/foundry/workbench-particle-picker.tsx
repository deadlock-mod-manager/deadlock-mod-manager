import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewAbilityEffect } from "@/types/generated/PreviewAbilityEffect";

interface Props {
  effects: PreviewAbilityEffect[];
  selected: string[];
  pending: boolean;
  onChange: (paths: string[]) => void;
}

export const ViewerParticlePicker = ({
  effects,
  selected,
  pending,
  onChange,
}: Props) => {
  const { t } = useTranslation();
  const id = useId();
  const [search, setSearch] = useState("");
  if (!effects.length) return null;
  const unique = [
    ...new Map(effects.map((effect) => [effect.path, effect])).values(),
  ];
  const automaticPaths = new Set(
    effects
      .filter((effect) => effect.phase === "cast" || effect.phase === "release")
      .map((effect) => effect.path),
  );
  const filtered = unique.filter((effect) =>
    `${effect.path} ${effect.field}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          aria-label={t("modelPreview.effectPicker")}
          title={t("modelPreview.effectPicker")}>
          <SlidersHorizontalIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        side='top'
        className='w-96 max-w-[calc(100vw-2rem)] p-0'>
        <div className='space-y-2 border-b p-3'>
          <h3 className='text-sm font-medium'>
            {t("modelPreview.effectPicker")}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {t("modelPreview.effectPickerHint")}
          </p>
          <Input
            aria-label={t("modelPreview.searchEffects")}
            placeholder={t("modelPreview.searchEffects")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='h-8 text-xs'
          />
        </div>
        <div className='max-h-64 overflow-auto p-1'>
          {filtered.map((effect, index) => {
            const automatic = automaticPaths.has(effect.path);
            const checked = automatic || selected.includes(effect.path);
            return (
              <label
                key={effect.path}
                htmlFor={`${id}-${index}`}
                className='flex cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-accent'>
                <Checkbox
                  id={`${id}-${index}`}
                  checked={checked}
                  disabled={
                    automatic || pending || (!checked && selected.length >= 8)
                  }
                  className='mt-0.5'
                  onCheckedChange={(value) =>
                    onChange(
                      value === true
                        ? [...selected, effect.path]
                        : selected.filter((path) => path !== effect.path),
                    )
                  }
                />
                <span className='min-w-0 text-xs'>
                  <span className='block truncate' title={effect.path}>
                    {effect.path.split("/").pop()}
                  </span>
                  <span
                    className='block truncate text-[10px] text-muted-foreground'
                    title={effect.field}>
                    {automatic
                      ? t("modelPreview.automaticEffect")
                      : effect.path}
                  </span>
                </span>
              </label>
            );
          })}
          {!filtered.length && (
            <p className='p-3 text-xs text-muted-foreground'>
              {t("modelPreview.noMatchingEffects")}
            </p>
          )}
        </div>
        {pending && (
          <p
            role='status'
            className='border-t px-3 py-2 text-xs text-muted-foreground'>
            {t("modelPreview.loadingEffects")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
