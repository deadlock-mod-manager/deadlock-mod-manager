import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { MinusIcon } from "@phosphor-icons/react";

interface Props {
  checked: boolean | "indeterminate";
  label: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const AssetImportCheckbox = ({
  checked,
  label,
  disabled,
  onCheckedChange,
}: Props) => (
  <span className='relative inline-flex shrink-0 align-middle'>
    <Checkbox
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className={checked === "indeterminate" ? "[&_svg]:invisible" : undefined}
    />
    {checked === "indeterminate" ? (
      <MinusIcon
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 m-auto size-3 text-primary'
        weight='bold'
      />
    ) : null}
  </span>
);
