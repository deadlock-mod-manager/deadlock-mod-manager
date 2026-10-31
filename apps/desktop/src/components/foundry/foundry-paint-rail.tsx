import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { HandPointingIcon, SparkleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryPaintPart } from "@/types/foundry";
import { partPaintKey, targetPaintKey, useFoundry } from "./foundry-context";
import { type PaintBrush } from "./use-paint-brush";
import {
  PART_GROUPS,
  TARGET_ORDER,
  TARGET_ICONS,
  coverage,
} from "./foundry-paint-utils";
import { SectionRow } from "./foundry-paint-section-row";
import { Swatch } from "./foundry-paint-swatch";

/** The left column: pick sections, or whole parts of the hero. */
export const PaintRail = ({ brush }: { brush: PaintBrush }) => {
  const { t } = useTranslation();
  const {
    paintParts,
    paintSelection,
    setPaintSelection,
    appliedPaint,
    hiddenParts,
    toggleHiddenPart,
    editedPaths,
    revertEntry,
    workspace,
    busy,
  } = useFoundry();
  const reset = (part: FoundryPaintPart) =>
    revertEntry(part.texture).catch((err) => {
      logger.withError(err).error("[Foundry] Section reset failed");
      toast.error(t("foundry.editor.revertFailed"));
    });
  const hasSections = paintParts.length > 0;
  // A hero without sections can only be painted part by part.
  const scope =
    paintSelection.kind === "target" || !hasSections ? "whole" : "sections";
  const selected = useMemo(
    () =>
      new Set(paintSelection.kind === "parts" ? paintSelection.textures : []),
    [paintSelection],
  );
  const groups = useMemo(
    () =>
      PART_GROUPS.map((group) => ({
        group,
        parts: paintParts.filter((part) => part.target === group),
      })).filter(({ parts }) => parts.length > 0),
    [paintParts],
  );

  const toggle = (texture: string) => {
    const next = selected.has(texture)
      ? [...selected].filter((entry) => entry !== texture)
      : [...selected, texture];
    setPaintSelection({ kind: "parts", textures: next });
  };
  const selectAll = (parts: FoundryPaintPart[]) =>
    setPaintSelection({
      kind: "parts",
      textures: [
        ...new Set([...selected, ...parts.map((part) => part.texture)]),
      ],
    });

  return (
    <>
      <div className='shrink-0 space-y-2.5 border-b p-3.5 pb-3'>
        <h2 className='font-semibold text-[13px]'>
          {t("foundry.paint.whatToPaint")}
        </h2>
        {hasSections && (
          <div
            className='flex gap-0.5 rounded-[7px] border bg-background p-[3px]'
            role='tablist'>
            {(["sections", "whole"] as const).map((option) => (
              <button
                aria-selected={scope === option}
                className={cn(
                  "flex-1 rounded-[5px] px-2 py-[5px] font-medium text-xs transition-colors",
                  scope === option
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option}
                onClick={() =>
                  setPaintSelection(
                    option === "whole"
                      ? { kind: "target", target: "body" }
                      : { kind: "parts", textures: [] },
                  )
                }
                role='tab'
                type='button'>
                {t(`foundry.paint.scope.${option}`)}
              </button>
            ))}
          </div>
        )}
        {scope === "sections" && (
          <p className='flex items-start gap-1.5 text-[11px] text-muted-foreground leading-[1.4]'>
            <HandPointingIcon className='mt-px h-[13px] w-[13px] shrink-0' />
            {t("foundry.paint.railPickHint")}
          </p>
        )}
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-3.5 p-2'>
          {scope === "sections" ? (
            <>
              {groups.map(({ group, parts }) => (
                <section className='space-y-0.5' key={group}>
                  <div className='flex items-center gap-1.5 px-1.5 pb-1'>
                    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
                      {t(`foundry.paint.targets.${group}`)}
                    </h3>
                    <span className='font-mono text-[10px] text-muted-foreground/60'>
                      {parts.length}
                    </span>
                    <button
                      className='ml-auto font-medium text-[11px] text-muted-foreground hover:text-foreground'
                      onClick={() => selectAll(parts)}
                      type='button'>
                      {t("foundry.paint.selectAll")}
                    </button>
                  </div>
                  {parts.map((part) => (
                    <SectionRow
                      appliedColor={
                        appliedPaint[partPaintKey(part.texture)]?.colorHex
                      }
                      hidden={hiddenParts.includes(part.texture)}
                      pendingColor={brush.pendingColors.get(part.texture)}
                      key={part.texture}
                      onReset={
                        workspace && !busy && editedPaths.has(part.texture)
                          ? () => reset(part)
                          : undefined
                      }
                      onToggle={() => toggle(part.texture)}
                      onToggleHidden={() => toggleHiddenPart(part.texture)}
                      part={part}
                      selected={selected.has(part.texture)}
                    />
                  ))}
                </section>
              ))}
              <div className='flex items-center gap-2 rounded-md border px-2.5 py-[9px]'>
                <SparkleIcon className='h-[15px] w-[15px] shrink-0 text-muted-foreground' />
                <p className='text-[11px] text-muted-foreground leading-[1.4]'>
                  {t("foundry.paint.effectsNote")}{" "}
                  <button
                    className='font-medium text-foreground underline-offset-2 hover:underline'
                    onClick={() =>
                      setPaintSelection({ kind: "target", target: "abilities" })
                    }
                    type='button'>
                    {t("foundry.paint.effectsSwitch")}
                  </button>
                </p>
              </div>
            </>
          ) : (
            <div className='space-y-0.5'>
              {TARGET_ORDER.map((target) => {
                const Icon = TARGET_ICONS[target];
                const count = coverage(brush.infoById.get(target));
                const active =
                  paintSelection.kind === "target" &&
                  paintSelection.target === target;
                const color = appliedPaint[targetPaintKey(target)]?.colorHex;
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-primary/25 bg-primary/[0.07]"
                        : "border-transparent hover:bg-muted",
                      count === 0 && "pointer-events-none opacity-45",
                    )}
                    disabled={count === 0}
                    key={target}
                    onClick={() =>
                      setPaintSelection({ kind: "target", target })
                    }
                    type='button'>
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                      weight='duotone'
                    />
                    <span className='min-w-0 flex-1'>
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          active && "font-semibold",
                        )}>
                        {t(`foundry.paint.targets.${target}`)}
                      </span>
                      <span className='block truncate text-[11px] text-muted-foreground'>
                        {count === 0
                          ? t("foundry.paint.nothingToPaint")
                          : t("foundry.paint.coverage", { count })}
                      </span>
                    </span>
                    {color && <Swatch color={color} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {scope === "sections" && (
        <div className='flex shrink-0 items-center gap-2 border-t px-3.5 py-2.5 text-xs'>
          <span className={cn(selected.size === 0 && "text-muted-foreground")}>
            {selected.size > 0
              ? t("foundry.paint.selectedCount", { count: selected.size })
              : t("foundry.paint.nothingSelected")}
          </span>
          {selected.size > 0 && (
            <button
              className='ml-auto font-medium text-muted-foreground hover:text-foreground'
              onClick={() => setPaintSelection({ kind: "parts", textures: [] })}
              type='button'>
              {t("foundry.paint.clearSelection")}
            </button>
          )}
        </div>
      )}
    </>
  );
};
