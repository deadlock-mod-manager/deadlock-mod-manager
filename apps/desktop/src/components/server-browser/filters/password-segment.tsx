import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { GlobeIcon, LockKeyIcon, LockKeyOpenIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { PasswordFilter } from "./types";

interface PasswordSegmentProps {
  value: PasswordFilter;
  onChange: (next: PasswordFilter) => void;
}

const PasswordSegment = ({ value, onChange }: PasswordSegmentProps) => {
  const { t } = useTranslation();
  const options = [
    {
      key: "all" as const,
      Icon: GlobeIcon,
      label: t("servers.filters.all"),
      tip: t("servers.filters.passwordSegment.allTooltip"),
    },
    {
      key: "open" as const,
      Icon: LockKeyOpenIcon,
      label: t("servers.filters.noPassword"),
      tip: t("servers.filters.passwordSegment.openTooltip"),
    },
    {
      key: "password" as const,
      Icon: LockKeyIcon,
      label: t("servers.filters.passwordOnly"),
      tip: t("servers.filters.passwordSegment.passwordTooltip"),
    },
  ];

  return (
    <ToggleGroup
      className='gap-0 rounded-md border border-border/60 bg-background/40 p-0.5'
      onValueChange={(v) => onChange((v || "all") as PasswordFilter)}
      size='sm'
      type='single'
      value={value}>
      {options.map(({ key, Icon, label, tip }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              aria-label={label}
              className={cn(
                "h-7 gap-1.5 rounded-[5px] px-2",
                "text-xs font-medium",
                "text-muted-foreground hover:text-foreground",
                "data-[state=on]:bg-primary/15 data-[state=on]:text-primary",
                "data-[state=on]:shadow-[inset_0_-1px_0_var(--color-primary)]",
              )}
              value={key}>
              <Icon className='size-3.5' weight='regular' />
              <span>{label}</span>
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{tip}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
};

export default PasswordSegment;
