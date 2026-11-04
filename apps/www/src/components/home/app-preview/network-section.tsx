import { cn } from "@deadlock-mods/ui/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "./section";

export const NetworkSection = () => {
  const { t } = useTranslation("preview");
  const [mode, setMode] = useState<"default" | "auto">("default");
  return (
    <Section
      title={t("settings.network.title")}
      description={t("settings.network.description")}>
      <div role='radiogroup' className='grid grid-cols-2 gap-3'>
        {(["default", "auto"] as const).map((option) => (
          <button
            key={option}
            type='button'
            role='radio'
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:border-primary/60",
              mode === option && "border-primary bg-primary/10",
            )}>
            <span className='block font-medium text-sm'>
              {t(`settings.network.${option}.title`)}
            </span>
            <span className='block text-muted-foreground text-xs'>
              {t(`settings.network.${option}.body`)}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
};
