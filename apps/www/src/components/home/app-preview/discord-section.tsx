import { cn } from "@deadlock-mods/ui/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "./section";
import { ToggleRow } from "./toggle-row";

export const DiscordSection = () => {
  const { t } = useTranslation("preview");
  const [enabled, setEnabled] = useState(true);
  return (
    <Section
      title={t("settings.discord.title")}
      description={t("settings.discord.description")}>
      <ToggleRow
        label={t("settings.discord.toggle.label")}
        description={t("settings.discord.toggle.description")}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      <div>
        <p className='font-bold text-sm'>
          {t("settings.discord.preview.title")}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t("settings.discord.preview.description")}
        </p>
        <div
          className={cn(
            "mt-3 flex w-80 items-center gap-3 rounded-lg bg-[#232428] p-3 text-white transition-opacity",
            !enabled && "opacity-40",
          )}>
          <img
            src='/home/heroes/vyper.webp'
            alt=''
            className='size-14 rounded-lg bg-black/30'
          />
          <div className='min-w-0 text-xs leading-snug'>
            <p className='font-semibold text-sm'>Deadlock</p>
            {enabled ? (
              <>
                <p className='truncate'>
                  {t("settings.discord.example.details")}
                </p>
                <p className='truncate text-white/70'>
                  {t("settings.discord.example.state")}
                </p>
              </>
            ) : (
              <p className='text-white/70'>{t("settings.discord.disabled")}</p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
};
