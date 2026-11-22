import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clampToRange,
  controlKind,
  formatBool,
  formatNumber,
  type NumericKind,
  numericStep,
  parseBool,
  parseNumber,
  sameValue,
} from "@/lib/performance/editor/values";
import { cn } from "@/lib/utils";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";

type EntryControlProps = {
  meta: ConvarMeta | null;
  value: string;
  /** The config's own value, whose style (true/false vs 1/0) edits keep. */
  styleOf: string | null;
  disabled: boolean;
  label: string;
  onCommit: (value: string) => void;
};

/** Local text that follows `value` whenever it changes from outside. */
const useEditableText = (value: string): [string, (text: string) => void] => {
  const [text, setText] = useState(value);
  const [source, setSource] = useState(value);
  if (source !== value) {
    setSource(value);
    setText(value);
  }
  return [text, setText];
};

const BoolControl = ({
  value,
  styleOf,
  disabled,
  label,
  onCommit,
}: Omit<EntryControlProps, "meta">) => {
  const { t } = useTranslation();
  const on = parseBool(value) ?? false;
  return (
    <div className='flex items-center gap-2.5'>
      <Switch
        aria-label={label}
        checked={on}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onCommit(formatBool(checked, styleOf ?? value))
        }
      />
      <span className='text-muted-foreground text-sm'>
        {on ? t("performance.editor.row.on") : t("performance.editor.row.off")}
      </span>
    </div>
  );
};

type NumberControlProps = Omit<EntryControlProps, "meta" | "styleOf"> & {
  meta: ConvarMeta;
  kind: NumericKind;
  withSlider: boolean;
};

const NumberControl = ({
  meta,
  kind,
  withSlider,
  value,
  disabled,
  label,
  onCommit,
}: NumberControlProps) => {
  const { t } = useTranslation();
  const [text, setText] = useEditableText(value);
  const parsed = parseNumber(text, kind);
  const step = numericStep(meta);
  const lastValid = parsed.ok ? parsed.value : Number(value);

  const commit = (next: string) => {
    if (!sameValue(next, value, kind)) onCommit(next);
  };

  const commitText = () => {
    if (parsed.ok) commit(formatNumber(parsed.value, kind));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commitText();
    if (event.key === "Escape") setText(value);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? step : -step;
      const next = formatNumber(lastValid + delta, kind);
      setText(next);
      commit(next);
    }
  };

  const error = parsed.ok
    ? null
    : t(
        parsed.error === "notAnInteger"
          ? "performance.editor.row.invalidInteger"
          : "performance.editor.row.invalidNumber",
      );

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-3'>
        {withSlider && meta.min !== null && meta.max !== null && (
          <Slider
            aria-label={label}
            className='min-w-0 flex-1'
            disabled={disabled}
            max={meta.max}
            min={meta.min}
            onValueChange={([next]) => setText(formatNumber(next, kind))}
            onValueCommit={([next]) => commit(formatNumber(next, kind))}
            step={step}
            value={[clampToRange(lastValid, meta)]}
          />
        )}
        <Input
          aria-invalid={error !== null}
          aria-label={label}
          className={cn(
            "h-8 w-24 shrink-0 font-mono text-sm",
            error && "border-destructive focus-visible:ring-destructive",
          )}
          disabled={disabled}
          inputMode={kind === "int" ? "numeric" : "decimal"}
          onBlur={commitText}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          value={text}
        />
      </div>
      {error && <span className='text-destructive text-xs'>{error}</span>}
    </div>
  );
};

const EnumControl = ({
  meta,
  value,
  disabled,
  label,
  onCommit,
}: Omit<EntryControlProps, "styleOf"> & { meta: ConvarMeta }) => {
  const { t } = useTranslation();
  const selected = meta.enumValues.find((option) =>
    sameValue(option.value, value, "int"),
  );
  // Radix Select can't hold an empty-string item, so an empty value shows as unselected.
  const unlisted = !selected && value !== "";
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== selected?.value) onCommit(next);
      }}
      value={selected?.value ?? (unlisted ? value : undefined)}>
      <SelectTrigger aria-label={label} className='h-8 normal-case'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {unlisted && (
          <SelectItem value={value}>
            {t("performance.editor.row.notListed", { value })}
          </SelectItem>
        )}
        {meta.enumValues.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const TextControl = ({
  value,
  disabled,
  label,
  onCommit,
}: Omit<EntryControlProps, "meta" | "styleOf">) => {
  const [text, setText] = useEditableText(value);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <Input
      aria-label={label}
      className='h-8 font-mono text-sm'
      disabled={disabled}
      onBlur={commit}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setText(value);
      }}
      value={text}
    />
  );
};

/** The input that fits the convar: switch, slider + number, number, select or text. */
export const EntryControl = (props: EntryControlProps) => {
  const { meta, value } = props;
  const kind = controlKind(meta, value);
  if (meta === null || kind === "text") return <TextControl {...props} />;
  if (kind === "switch") return <BoolControl {...props} />;
  if (kind === "select") return <EnumControl {...props} meta={meta} />;
  if (meta.kind !== "int" && meta.kind !== "float") {
    return <TextControl {...props} />;
  }
  return (
    <NumberControl
      {...props}
      kind={meta.kind}
      meta={meta}
      withSlider={kind === "slider"}
    />
  );
};
