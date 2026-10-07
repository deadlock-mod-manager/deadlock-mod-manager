import { Button } from "@deadlock-mods/ui/components/button";
import { AlertCircle, Download } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DOWNLOAD_URL } from "@/lib/constants";

export const ErrorState = () => {
  const { t } = useTranslation("download");

  return (
    <div className='container mx-auto max-w-4xl py-12'>
      <div className='mb-8 text-center'>
        <AlertCircle className='mx-auto mb-4 h-12 w-12 text-destructive' />
        <h1 className='mb-4 font-bold text-3xl'>{t("error.title")}</h1>
        <p className='mb-6 text-muted-foreground'>{t("error.description")}</p>
        <Button asChild>
          <a href={DOWNLOAD_URL} rel='noopener noreferrer' target='_blank'>
            <Download className='mr-2 h-4 w-4' />
            {t("error.github")}
          </a>
        </Button>
      </div>
    </div>
  );
};
