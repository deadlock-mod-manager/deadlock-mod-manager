import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  CaretDownIcon,
  EyeIcon,
  EyeSlashIcon,
  QuestionIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelMaterialSelection } from "@/lib/model-material-selection";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";

interface Props {
  edits: readonly ModdingModelPartEdit[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
  expanded,
  onExpandedChange,
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
  const listId = useId();
  const visible = edits.filter((edit) =>
    edit.material.toLowerCase().includes(filter.toLowerCase()),
  );
  const names = visible.map((edit) => edit.material);
  return (
    <section
      className='shrink-0 border-b'
      aria-label={t("modelEditor.materials")}>
      <div className='flex items-center gap-1 px-3 py-2'>
        <button
          type='button'
          aria-expanded={expanded}
          aria-controls={listId}
          className='flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          onClick={() => onExpandedChange(!expanded)}>
          <CaretDownIcon
            className={`size-3 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          {t("modelEditor.materials")}
          <span className='rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground'>
            {edits.length}
          </span>
        </button>
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
      <div id={listId} hidden={!expanded}>
        <div className='relative mx-3 mb-2'>
          <MagnifyingGlassIcon className='pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground' />
          <Input
            className='h-8 pl-8 text-xs'
            aria-label={t("modelEditor.filter")}
            placeholder={t("modelEditor.filter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className='flex items-center gap-1 px-3 pb-1 text-[11px]'>
          <span
            className='mr-auto tabular-nums text-muted-foreground'
            aria-live='polite'>
            {t("modelEditor.selectedCount", {
              count: selection.materials.size,
            })}
          </span>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-1.5 text-[11px]'
            disabled={disabled || !names.length}
            onClick={() => onSelectAll(names)}>
            {t("modelEditor.selectAll")}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='h-6 px-1.5 text-[11px]'
            disabled={disabled || !selection.materials.size}
            onClick={() => onSelectAll([])}>
            {t("modelEditor.clearSelection")}
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='size-6 text-muted-foreground'
            aria-label={t("modelEditor.selectionHint")}
            title={t("modelEditor.selectionHint")}>
            <QuestionIcon className='size-3.5' />
          </Button>
        </div>
        <ul
          className='max-h-36 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-gutter:stable]'
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
                className={`flex items-center gap-2 rounded-md px-2 ${selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"}`}>
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

                <button
                  type='button'
                  className='min-w-0 flex-1 select-none truncate py-2 text-left text-xs focus-visible:outline-none focus-visible:underline'
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
                      : t("modelEditor.visible", {
                          material: candidate.material,
                        })
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
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className='px-2 py-4 text-center text-xs text-muted-foreground'>
              {t("modelEditor.inspector.noMaterials")}
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
