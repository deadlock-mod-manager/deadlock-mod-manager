import { useTranslation } from "react-i18next";

export const DownloadHeader = () => {
  const { t } = useTranslation();

  return (
    <div className='mb-12 text-center'>
      <h1 className='mb-4 font-bold text-4xl'>{t("downloads.pageTitle")}</h1>
      <p className='text-lg text-muted-foreground'>
        {t("downloads.pageDescription")}
      </p>
    </div>
  );
};
