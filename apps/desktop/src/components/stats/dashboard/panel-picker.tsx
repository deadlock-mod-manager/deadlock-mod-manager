import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PANEL_IDS, panelDef } from "./panels";

export const PanelPicker = ({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (panel: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-1.5'>
      {PANEL_IDS.map((id) => {
        const Icon = panelDef(id)?.icon;
        return (
          <button
            aria-pressed={selected === id}
            className={cn(
              "flex items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
              selected === id
                ? "border-primary bg-primary/10"
                : "hover:bg-accent",
            )}
            key={id}
            onClick={() => onSelect(id)}
            type='button'>
            {Icon && (
              <Icon className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
            )}
            <span className='flex flex-col gap-0.5'>
              <span className='font-medium text-sm'>
                {t(`stats.dashboard.panels.${id}.title`)}
              </span>
              <span className='text-muted-foreground text-xs leading-snug'>
                {t(`stats.dashboard.panels.${id}.description`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
