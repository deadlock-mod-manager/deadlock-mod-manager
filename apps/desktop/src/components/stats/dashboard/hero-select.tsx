import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardData } from "./dashboard-context";
import { ALL } from "./nullable-number-select";

const useHeroOptions = () => {
  const { heroesById } = useDashboardData();
  return useMemo(
    () => [...heroesById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [heroesById],
  );
};

export const HeroSelect = ({
  value,
  allowAll,
  onChange,
}: {
  value: number;
  allowAll: boolean;
  onChange: (heroId: number) => void;
}) => {
  const { t } = useTranslation();
  const heroes = useHeroOptions();
  return (
    <Select
      onValueChange={(next) => onChange(next === ALL ? 0 : Number(next))}
      value={value === 0 ? ALL : String(value)}>
      <SelectTrigger className='h-9'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='max-h-72'>
        {allowAll && (
          <SelectItem value={ALL}>
            {t("stats.dashboard.options.allHeroes")}
          </SelectItem>
        )}
        {heroes.map((hero) => (
          <SelectItem key={hero.id} value={String(hero.id)}>
            {hero.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
