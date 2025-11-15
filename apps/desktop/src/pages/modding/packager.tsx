import { useTranslation } from "react-i18next";
import PackagingWizard from "@/components/modding/packaging-wizard";
import PageTitle from "@/components/shared/page-title";

const Packager = () => {
  const { t } = useTranslation();

  return (
    <div className='flex w-full'>
      <div className='flex w-full flex-col gap-4'>
        <PageTitle
          className='px-4'
          title={t("navigation.packager")}
          subtitle={t("packager.description")}
        />
        <div className='px-4 flex-grow h-full'>
          <PackagingWizard />
        </div>
      </div>
    </div>
  );
};

export default Packager;
