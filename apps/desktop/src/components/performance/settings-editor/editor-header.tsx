import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { CheckCircleIcon, CircleNotchIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Chip } from "@/components/performance/configs/card-parts";
import type { EditorConfigOption } from "@/lib/performance/editor/configs";
import { tierForScore } from "@/lib/performance/scale";
import { TierIcon } from "../tier-icon";
import type { ResolvedConfig } from "@/types/generated/ResolvedConfig";

type ConfigPickerProps = {
  options: EditorConfigOption[];
  value: string | null;
  appliedConfigId: string | null;
  onChange: (configId: string) => void;
};

export const ConfigPicker = ({
  options,
  value,
  appliedConfigId,
  onChange,
}: ConfigPickerProps) => {
  const { t } = useTranslation();
  const groups = [
    {
      id: "preset",
      label: t("performance.editor.header.presets"),
      options: options.filter((option) => option.group === "preset"),
    },
    {
      id: "user",
      label: t("performance.editor.header.yourConfigs"),
      options: options.filter((option) => option.group === "user"),
    },
  ].filter((group) => group.options.length > 0);

  return (
    <Select onValueChange={onChange} value={value ?? undefined}>
      <SelectTrigger
        aria-label={t("performance.editor.header.pickConfig")}
        className='h-8 w-auto min-w-64 max-w-md justify-start gap-2 normal-case [&>svg]:ml-auto'>
        <span className='shrink-0 text-muted-foreground'>
          {t("performance.editor.header.editing")}
        </span>
        <SelectValue placeholder={t("performance.editor.header.pickConfig")} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel className='text-muted-foreground text-xs'>
              {group.label}
            </SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.configId} value={option.configId}>
                <span className='flex items-center gap-2'>
                  <span className='truncate font-medium'>{option.name}</span>
                  {option.configId === appliedConfigId && (
                    <Chip icon={<CheckCircleIcon aria-hidden />} tone='success'>
                      {t("performance.activeStatus.active")}
                    </Chip>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};

type EditorHeaderProps = ConfigPickerProps & {
  resolved: ResolvedConfig | undefined;
  isUpdating: boolean;
  /** View controls shown at the end of the row. */
  actions: ReactNode;
};

export const EditorHeader = ({
  resolved,
  isUpdating,
  actions,
  ...pickerProps
}: EditorHeaderProps) => {
  const { t } = useTranslation();
  const tier = resolved ? tierForScore(resolved.cutScore) : null;

  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
      <ConfigPicker {...pickerProps} />
      {tier && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className='inline-flex cursor-help items-center gap-1.5 rounded-sm text-muted-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              tabIndex={0}>
              <TierIcon tier={tier.id} />
              {t(`performance.tiers.${tier.id}.label`)}
            </span>
          </TooltipTrigger>
          <TooltipContent className='max-w-64'>
            {t("performance.editor.header.tierTooltip")}
          </TooltipContent>
        </Tooltip>
      )}
      {isUpdating && (
        <span className='flex items-center gap-1.5 text-muted-foreground text-xs'>
          <CircleNotchIcon className='size-3.5 animate-spin' />
          {t("performance.editor.header.updating")}
        </span>
      )}
      <div className='ml-auto flex shrink-0 items-center gap-3'>{actions}</div>
    </div>
  );
};
