import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useTranslation } from "react-i18next";
import {
  type PresetDef,
  type PresetParams,
} from "@/lib/stats/dashboard/catalog";
import { OptionRow } from "./view-options";
import { HeroSelect } from "./hero-select";

export const PresetParamsEditor = ({
  preset,
  params,
  onChange,
}: {
  preset: PresetDef;
  params: PresetParams;
  onChange: (params: PresetParams) => void;
}) => {
  const { t } = useTranslation();
  if (preset.params.length === 0) {
    return null;
  }
  return (
    <div className='grid grid-cols-2 gap-3'>
      {preset.params.map((param) => {
        const value = params[param.key] ?? param.default;
        return (
          <OptionRow
            key={param.key}
            label={t(`stats.dashboard.params.${param.key}`)}>
            {param.kind === "hero" ? (
              <HeroSelect
                allowAll={param.default === 0}
                onChange={(heroId) =>
                  onChange({ ...params, [param.key]: heroId })
                }
                value={Number(value)}
              />
            ) : (
              <Select
                onValueChange={(next) => {
                  const option = param.options?.find(
                    (entry) => String(entry.value) === next,
                  );
                  if (option) {
                    onChange({ ...params, [param.key]: option.value });
                  }
                }}
                value={String(value)}>
                <SelectTrigger className='h-9'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {param.options?.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {t(`stats.dashboard.options.${option.label}`, {
                        count: option.count,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </OptionRow>
        );
      })}
    </div>
  );
};
