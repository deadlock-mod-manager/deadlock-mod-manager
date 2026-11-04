import { useTranslation } from "react-i18next";
import { Section } from "./section";

export const AutoexecSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title='Autoexec.cfg'
      description={t("settings.autoexec.description")}>
      <div className='rounded-lg border border-border/50 bg-card/50 p-4'>
        <h5 className='font-semibold text-primary'>
          {t("settings.autoexec.whatIs")}
        </h5>
        <p className='mt-2 text-muted-foreground text-sm'>
          {t("settings.autoexec.explanation")}
        </p>
        <p className='mt-2 text-muted-foreground text-sm'>
          {t("settings.autoexec.usage")}
        </p>
      </div>
    </Section>
  );
};
