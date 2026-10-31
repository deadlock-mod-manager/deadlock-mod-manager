import { Badge } from "@deadlock-mods/ui/components/badge";
import { Input } from "@deadlock-mods/ui/components/input";
import { Search } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PRESET_CATEGORIES,
  PRESETS,
  type PresetDef,
} from "@/lib/stats/dashboard/catalog";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./dashboard-context";

interface PresetPickerProps {
  selectedId: string | null;
  onSelect: (preset: PresetDef) => void;
}

export const PresetPicker = ({ selectedId, onSelect }: PresetPickerProps) => {
  const { t } = useTranslation();
  const { accountId } = useDashboardData();
  const [search, setSearch] = useState("");

  const text = (preset: PresetDef) =>
    `${t(`stats.dashboard.presets.${preset.id}.title`)} ${t(`stats.dashboard.presets.${preset.id}.description`)}`.toLowerCase();

  const query = search.trim().toLowerCase();
  const visible = PRESETS.filter(
    (preset) => query === "" || text(preset).includes(query),
  );

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative'>
        <Search className='absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground' />
        <Input
          className='h-9 pl-8'
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("stats.dashboard.editor.searchPresets")}
          value={search}
        />
      </div>
      {PRESET_CATEGORIES.map((category) => {
        const presets = visible.filter(
          (preset) => preset.category === category,
        );
        if (presets.length === 0) {
          return null;
        }
        return (
          <section className='flex flex-col gap-1.5' key={category}>
            <h4 className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
              {t(`stats.dashboard.categories.${category}`)}
            </h4>
            {presets.map((preset) => (
              <button
                aria-pressed={selectedId === preset.id}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                  selectedId === preset.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-accent",
                )}
                data-preset-id={preset.id}
                key={preset.id}
                onClick={() => onSelect(preset)}
                type='button'>
                <span className='flex items-center gap-2 font-medium text-sm'>
                  {t(`stats.dashboard.presets.${preset.id}.title`)}
                  {preset.needsAccount && accountId === null && (
                    <Badge className='h-4 px-1 text-[10px]' variant='outline'>
                      {t("stats.dashboard.needsAccount")}
                    </Badge>
                  )}
                </span>
                <span className='text-muted-foreground text-xs leading-snug'>
                  {t(`stats.dashboard.presets.${preset.id}.description`)}
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {visible.length === 0 && (
        <p className='py-6 text-center text-muted-foreground text-sm'>
          {t("stats.dashboard.editor.noPresets")}
        </p>
      )}
    </div>
  );
};
