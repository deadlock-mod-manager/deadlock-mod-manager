import { Badge } from "@deadlock-mods/ui/components/badge";
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
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { EditorConfigOption } from "@/lib/performance/editor/configs";
import { tierForScore } from "@/lib/performance/scale";
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
        className='h-8 w-64 normal-case'>
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
                {option.configId === appliedConfigId
                  ? t("performance.editor.header.appliedOption", {
                      name: option.name,
                    })
                  : option.name}
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
};

const leftOutCount = ({ counts }: ResolvedConfig) =>
  counts.blocked +
  counts.removed +
  counts.notConvar +
  counts.excluded +
  counts.denied +
  counts.unsupported +
  counts.engineSection;

export const EditorHeader = ({
  resolved,
  isUpdating,
  ...pickerProps
}: EditorHeaderProps) => {
  const { t } = useTranslation();
  const isApplied = pickerProps.value === pickerProps.appliedConfigId;
  const tier = resolved ? tierForScore(resolved.cutScore) : null;

  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
      <span className='text-muted-foreground text-sm'>
        {t("performance.editor.header.editing")}
      </span>
      <ConfigPicker {...pickerProps} />
      <Badge
        className='font-normal'
        variant={isApplied ? "secondary" : "outline"}>
        {isApplied
          ? t("performance.editor.header.applied")
          : t("performance.editor.header.notApplied")}
      </Badge>
      {tier && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className='gap-1.5 font-normal' variant='outline'>
              <span aria-hidden>{tier.emoji}</span>
              {t(`performance.tiers.${tier.id}.label`)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className='max-w-64'>
            {t("performance.editor.header.tierTooltip")}
          </TooltipContent>
        </Tooltip>
      )}
      {resolved && (
        <span className='font-mono text-muted-foreground text-xs'>
          {t("performance.editor.header.summary", {
            written: resolved.counts.applies,
            leftOut: leftOutCount(resolved),
          })}
        </span>
      )}
      {isUpdating && (
        <span className='flex items-center gap-1.5 text-muted-foreground text-xs'>
          <CircleNotchIcon className='size-3.5 animate-spin' />
          {t("performance.editor.header.updating")}
        </span>
      )}
    </div>
  );
};
