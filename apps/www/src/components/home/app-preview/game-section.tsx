import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { LocalToggle } from "./local-toggle";
import { usePreviewState } from "./preview-state";
import { Section } from "./section";

export const GameSection = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  return (
    <>
      <Section
        title={t("settings.game.path.title")}
        description={t("settings.game.path.description")}>
        <div className='flex gap-2'>
          <div className='flex h-9 min-w-0 flex-1 items-center rounded-md border border-input px-3 font-mono text-muted-foreground text-xs'>
            <span className='truncate'>
              C:\Program Files (x86)\Steam\steamapps\common\Deadlock
            </span>
          </div>
          <button
            type='button'
            onClick={() =>
              notify(
                t("settings.game.detected.title"),
                t("settings.game.detected.description"),
              )
            }
            className={buttonVariants({ variant: "outline" })}>
            {t("settings.game.autoDetect")}
          </button>
        </div>
      </Section>
      <Section
        title={t("settings.game.protection.title")}
        description={t("settings.game.protection.description")}>
        <LocalToggle
          label={t("settings.game.blockChanges.label")}
          description={t("settings.game.blockChanges.description")}
          initial
        />
      </Section>
    </>
  );
};
