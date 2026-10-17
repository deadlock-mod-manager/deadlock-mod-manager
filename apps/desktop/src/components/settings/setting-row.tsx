import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type SettingRowProps = {
  title: string;
  description?: string;
  descriptionId?: string;
  notes?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
};

export const SettingRow = ({
  title,
  description,
  descriptionId,
  notes,
  extra,
  children,
}: SettingRowProps) => (
  <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6'>
    <div className='flex min-w-0 items-center gap-3'>
      <div className='min-w-0 space-y-1'>
        <Label className='font-bold text-sm'>{title}</Label>
        {description && (
          <p className='text-muted-foreground text-sm' id={descriptionId}>
            {description}
          </p>
        )}
        {notes}
      </div>
      {extra}
    </div>
    <div className='flex shrink-0 items-center gap-2'>{children}</div>
  </div>
);

/**
 * Both words share one grid cell so the column is as wide as the longer one in
 * the current language, keeping switches aligned across rows and still on toggle.
 * It stays a click target but is hidden from screen readers, so the switch needs
 * its own aria-label to keep the state word out of its accessible name.
 */
export const SwitchStatus = ({
  checked,
  htmlFor,
}: {
  checked: boolean;
  htmlFor: string;
}) => {
  const { t } = useTranslation();
  const enabled = t("status.enabled");
  const disabled = t("status.disabled");

  return (
    <Label aria-hidden='true' className='grid' htmlFor={htmlFor}>
      <span className='col-start-1 row-start-1'>
        {checked ? enabled : disabled}
      </span>
      <span className='invisible col-start-1 row-start-1'>
        {checked ? disabled : enabled}
      </span>
    </Label>
  );
};

type SettingToggleRowProps = {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  extra?: ReactNode;
};

export const SettingToggleRow = ({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  extra,
}: SettingToggleRowProps) => {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <SettingRow
      description={description}
      descriptionId={descriptionId}
      extra={extra}
      title={title}>
      <Switch
        aria-describedby={descriptionId}
        aria-label={title}
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      />
      <SwitchStatus checked={checked} htmlFor={id} />
    </SettingRow>
  );
};
