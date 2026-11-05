import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { useTranslation } from "react-i18next";

interface Props {
  selectedCount: number;
  totalCount: number;
  move: number[];
  scale: number[];
  busy: boolean;
  dirty: boolean;
  canUndo: boolean;
  error?: string;
  onMove: (axis: number, value: number) => void;
  onScale: (axis: number, value: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApply: () => void;
  onUndo: () => void;
  onReset: () => void;
  onSave: () => void;
}

const operations: ("move" | "scale")[] = ["move", "scale"];

export function SourceGeometryPanel(props: Props) {
  const { t } = useTranslation();
  const valid =
    [...props.move, ...props.scale].every(Number.isFinite) &&
    props.scale.every((value) => value > 0);
  return (
    <aside className='flex w-64 shrink-0 flex-col border-l bg-muted/10'>
      <div className='border-b p-3'>
        <h3 className='text-sm font-medium'>{t("geometry.title")}</h3>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t("geometry.pickHint")}
        </p>
      </div>
      <div className='flex-1 space-y-4 overflow-y-auto p-3'>
        <div>
          <p aria-live='polite' className='mb-2 text-xs'>
            {t("geometry.selected", { count: props.selectedCount })}
          </p>
          <div className='flex gap-1'>
            <Button
              size='sm'
              variant='outline'
              disabled={props.busy || !props.totalCount}
              onClick={props.onSelectAll}>
              {t("geometry.selectAll")}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={props.busy || !props.selectedCount}
              onClick={props.onClearSelection}>
              {t("geometry.clearSelection")}
            </Button>
          </div>
        </div>
        {operations.map((operation) => (
          <fieldset
            key={operation}
            disabled={props.busy || !props.selectedCount}>
            <legend className='mb-2 text-xs font-medium'>
              {t(`geometry.${operation}`)}
            </legend>
            <div className='grid grid-cols-3 gap-2'>
              {["X", "Y", "Z"].map((axis, index) => (
                <label key={axis} className='text-[10px] text-muted-foreground'>
                  {axis}
                  <Input
                    type='number'
                    step={operation === "move" ? 0.1 : 0.05}
                    min={operation === "scale" ? 0.001 : undefined}
                    aria-label={`${t(`geometry.${operation}`)} ${axis}`}
                    value={
                      Number.isFinite(
                        (operation === "move" ? props.move : props.scale)[
                          index
                        ],
                      )
                        ? (operation === "move" ? props.move : props.scale)[
                            index
                          ]
                        : ""
                    }
                    onChange={(event) =>
                      (operation === "move" ? props.onMove : props.onScale)(
                        index,
                        event.currentTarget.value === ""
                          ? Number.NaN
                          : event.currentTarget.valueAsNumber,
                      )
                    }
                    className='mt-1 h-8 px-2 text-xs'
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <Button
          size='sm'
          variant='outline'
          className='w-full'
          disabled={!valid || !props.selectedCount || props.busy}
          onClick={props.onApply}>
          {t("geometry.apply")}
        </Button>
        <p className='text-xs text-muted-foreground'>
          {t("geometry.description")}
        </p>
        {!valid && (
          <p role='alert' className='text-xs text-destructive'>
            {t("geometry.invalidTransform")}
          </p>
        )}
        {props.error && (
          <p role='alert' className='text-xs text-destructive'>
            {props.error}
          </p>
        )}
      </div>
      <div className='space-y-2 border-t p-3'>
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant='outline'
            className='flex-1'
            disabled={!props.canUndo || props.busy}
            onClick={props.onUndo}>
            {t("geometry.undo")}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            className='flex-1'
            disabled={!props.dirty || props.busy}
            onClick={props.onReset}>
            {t("geometry.reset")}
          </Button>
        </div>
        <Button
          size='sm'
          className='w-full'
          disabled={!props.dirty || !valid || props.busy}
          onClick={props.onSave}>
          {props.busy ? t("geometry.saving") : t("geometry.save")}
        </Button>
      </div>
    </aside>
  );
}
