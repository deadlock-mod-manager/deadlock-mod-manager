import { useTranslation } from "react-i18next";
import PageTitle from "@/components/shared/page-title";

const Developer = () => {
  const { t } = useTranslation();

  return (
    <div className='flex w-full'>
      <div className='flex w-full flex-col gap-4'>
        <PageTitle
          className='px-4'
          title={t("navigation.developer")}
          subtitle={t("developer.description")}
        />
      </div>
    </div>
  );
};

export default Developer;
