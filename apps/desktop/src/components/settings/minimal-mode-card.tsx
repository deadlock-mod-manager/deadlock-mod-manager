import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { FeatherIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { SwitchStatus } from "@/components/settings/setting-row";
import { cn } from "@/lib/utils";

type MinimalModeCardProps = {
  checked: boolean;
  disabled: boolean;
  /** Features the user has on, so paused while Minimal DMM is on. */
  enabledCount: number;
  total: number;
  onCheckedChange: (checked: boolean) => void;
};

export const MinimalModeCard = ({
  checked,
  disabled,
  enabledCount,
  total,
  onCheckedChange,
}: MinimalModeCardProps) => {
  const { t } = useTranslation();
  const statusText = () => {
    if (!checked) {
      return t("optionalFeatures.minimal.enabledCount", {
        count: enabledCount,
        total,
      });
    }
    return enabledCount > 0
      ? t("optionalFeatures.minimal.paused", { count: enabledCount })
      : t("optionalFeatures.minimal.nothingPaused");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border p-4 transition-colors duration-300 ease-out",
        checked
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-border bg-card",
      )}>
      <span
        aria-hidden='true'
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors duration-300 ease-out",
          checked
            ? "bg-primary text-primary-foreground"
            : "bg-muted/60 text-muted-foreground",
        )}>
        <FeatherIcon size={20} weight={checked ? "fill" : "duotone"} />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <Label className='font-bold text-sm' htmlFor='feature-minimal'>
          {t("optionalFeatures.minimal.title")}
        </Label>
        <p
          className='text-muted-foreground text-sm'
          id='feature-minimal-description'>
          {t("optionalFeatures.minimal.description")}
        </p>
        <p
          aria-live='polite'
          className={cn(
            "text-xs tabular-nums",
            checked ? "text-primary" : "text-muted-foreground",
          )}>
          {statusText()}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Switch
          aria-describedby='feature-minimal-description'
          aria-label={t("optionalFeatures.minimal.title")}
          checked={checked}
          disabled={disabled}
          id='feature-minimal'
          onCheckedChange={onCheckedChange}
        />
        <SwitchStatus checked={checked} htmlFor='feature-minimal' />
      </div>
    </div>
  );
};
