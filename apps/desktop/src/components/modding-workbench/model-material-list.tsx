import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelMaterialSelection } from "@/lib/model-material-selection";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";

interface Props {
  edits: readonly ModdingModelPartEdit[];
  selection: ModelMaterialSelection;
  isolated: boolean;
  disabled: boolean;
  onPick: (
    material: string,
    visible: string[],
    modifiers: { toggle?: boolean; range?: boolean },
  ) => void;
  onSelectAll: (materials: string[]) => void;
  onVisibility: (edit: ModdingModelPartEdit) => void;
  onIsolate: () => void;
}

export function ModelMaterialList({
  edits,
  selection,
  isolated,
  disabled,
  onPick,
  onSelectAll,
  onVisibility,
  onIsolate,
}: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const visible = edits.filter((edit) =>
    edit.material.toLowerCase().includes(filter.toLowerCase()),
  );
  const names = visible.map((edit) => edit.material);
  return (
    <>
      <div className='shrink-0 space-y-2 border-b p-3'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-xs font-medium'>
            {t("modelEditor.materials")}
            <span className='ml-2 font-normal text-muted-foreground'>
              {edits.length}
            </span>
          </h3>
          <Button
            size='sm'
            variant={isolated ? "secondary" : "ghost"}
            className='h-7 px-2 text-xs'
            aria-pressed={isolated}
            disabled={disabled || !selection.materials.size}
            title={t("modelEditor.isolateHint")}
            onClick={onIsolate}>
            {t("modelEditor.isolate")}
          </Button>
        </div>
        <Input
          className='h-8 text-xs'
          aria-label={t("modelEditor.filter")}
          placeholder={t("modelEditor.filter")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className='flex flex-wrap items-center gap-1 text-[11px]'>
          <span className='mr-auto text-muted-foreground' aria-live='polite'>
            {t("modelEditor.selectedCount", {
              count: selection.materials.size,
            })}
          </span>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-2 text-[11px]'
            disabled={disabled || !names.length}
            onClick={() => onSelectAll(names)}>
            {t("modelEditor.selectAll")}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-2 text-[11px]'
            disabled={disabled || !selection.materials.size}
            onClick={() => onSelectAll([])}>
            {t("modelEditor.clearSelection")}
          </Button>
        </div>
        <p className='text-[10px] leading-relaxed text-muted-foreground'>
          {t("modelEditor.selectionHint")}
        </p>
      </div>
      <ul
        className='max-h-40 shrink-0 overflow-y-auto border-b p-1'
        aria-label={t("modelEditor.materials")}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "a" &&
            !disabled
          ) {
            event.preventDefault();
            onSelectAll(names);
          }
        }}>
        {visible.map((candidate) => {
          const selected = selection.materials.has(candidate.material);
          return (
            <li
              key={candidate.material}
              className={`flex items-center gap-1 rounded px-1 ${selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"}`}>
              <Checkbox
                checked={selected}
                disabled={disabled}
                aria-label={t("modelEditor.selectMaterial", {
                  material: candidate.material,
                })}
                onCheckedChange={() =>
                  onPick(candidate.material, names, { toggle: true })
                }
              />
              <Button
                size='icon'
                variant='ghost'
                className='size-7 shrink-0'
                disabled={disabled}
                aria-label={
                  selected && selection.materials.size > 1
                    ? t(
                        candidate.hidden
                          ? "modelEditor.showSelected"
                          : "modelEditor.hideSelected",
                      )
                    : t("modelEditor.visible", { material: candidate.material })
                }
                aria-pressed={!candidate.hidden}
                title={t(
                  selected && selection.materials.size > 1
                    ? candidate.hidden
                      ? "modelEditor.showSelected"
                      : "modelEditor.hideSelected"
                    : candidate.hidden
                      ? "modelEditor.showPart"
                      : "modelEditor.hidePart",
                )}
                onClick={() => onVisibility(candidate)}>
                {candidate.hidden ? <EyeSlashIcon /> : <EyeIcon />}
              </Button>
              <button
                type='button'
                className='min-w-0 flex-1 select-none truncate py-1.5 text-left text-xs'
                disabled={disabled}
                title={candidate.material}
                aria-pressed={selected}
                onClick={(event) =>
                  onPick(candidate.material, names, {
                    toggle: event.ctrlKey || event.metaKey,
                    range: event.shiftKey,
                  })
                }>
                {candidate.material
                  .split("/")
                  .at(-1)
                  ?.replace(/\.vmat$/, "")}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
