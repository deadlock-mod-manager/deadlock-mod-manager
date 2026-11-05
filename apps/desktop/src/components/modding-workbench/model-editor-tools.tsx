import { Button } from "@deadlock-mods/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import {
  ArrowCounterClockwiseIcon,
  PaintBrushIcon,
  StickerIcon,
  SlidersHorizontalIcon,
  LightningIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type ModelEditorTool = "material" | "paint" | "stickers" | "effects";
const TOOLS = [
  { value: "material", Icon: SlidersHorizontalIcon },
  { value: "paint", Icon: PaintBrushIcon },
  { value: "stickers", Icon: StickerIcon },
  { value: "effects", Icon: LightningIcon },
] satisfies { value: ModelEditorTool; Icon: typeof PaintBrushIcon }[];

export function ModelEditorTools({
  tool,
  onToolChange,
  material,
  selectedCount,
  disabled,
  resetDisabled,
  onReset,
  children,
}: {
  tool: ModelEditorTool;
  onToolChange: (tool: ModelEditorTool) => void;
  material: string | undefined;
  selectedCount: number;
  disabled: boolean;
  resetDisabled: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const multiple = selectedCount > 1;
  const resetLabel = t(
    multiple ? "modelEditor.resetSelected" : "modelEditor.resetPart",
  );
  return (
    <>
      <div className='flex shrink-0 items-center gap-2 border-b bg-muted/20 px-4 py-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-[10px] font-medium uppercase tracking-wider text-muted-foreground'>
            {t(
              multiple
                ? "modelEditor.inspector.selection"
                : "modelEditor.inspector.editing",
            )}
          </p>
          <h3 className='truncate text-sm font-semibold' title={material}>
            {multiple
              ? t("modelEditor.selectedCount", { count: selectedCount })
              : (material
                  ?.split("/")
                  .at(-1)
                  ?.replace(/\.vmat$/, "") ?? t("modelEditor.noSelection"))}
          </h3>
        </div>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          disabled={resetDisabled || !material}
          aria-label={resetLabel}
          title={resetLabel}
          onClick={onReset}>
          <ArrowCounterClockwiseIcon className='size-4' />
        </Button>
      </div>
      <Tabs
        value={tool}
        className='flex min-h-0 flex-1 flex-col'
        onValueChange={(value) => {
          if (
            value === "material" ||
            value === "paint" ||
            value === "stickers" ||
            value === "effects"
          )
            onToolChange(value);
        }}>
        <TabsList
          aria-label={t("modelEditor.inspector.tools")}
          className='h-auto w-full shrink-0 justify-start gap-0 rounded-none border-b bg-transparent p-1.5'>
          {TOOLS.map(({ value, Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={disabled}
              className='h-9 min-w-0 flex-1 gap-1.5 px-1 text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none'>
              <Icon className='size-3.5 shrink-0' />
              {t(`modelEditor.inspector.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]'
          aria-label={t("modelEditor.materialSettings")}>
          {children}
        </div>
      </Tabs>
    </>
  );
}
