import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";

export const ALL = "__all";

export const NullableNumberSelect = ({
  value,
  choices,
  noneLabel,
  label,
  onChange,
}: {
  value: number | null;
  choices: readonly number[];
  noneLabel: string;
  label: (count: number) => string;
  onChange: (value: number | null) => void;
}) => (
  <Select
    onValueChange={(next) => onChange(next === ALL ? null : Number(next))}
    value={value === null ? ALL : String(value)}>
    <SelectTrigger className='h-9'>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>{noneLabel}</SelectItem>
      {choices.map((choice) => (
        <SelectItem key={choice} value={String(choice)}>
          {label(choice)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
