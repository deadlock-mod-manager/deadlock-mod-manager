import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeftIcon, CrosshairIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActiveCrosshairs } from "@/components/crosshairs/active-crosshairs";
import { CrosshairForm } from "@/components/crosshairs/crosshair-form";
import { CrosshairLibrary } from "@/components/crosshairs/crosshair-library";
import PageTitle from "@/components/shared/page-title";

const Crosshairs = () => {
  const { t } = useTranslation();
  const [showCrosshairForm, setShowCrosshairForm] = useState(false);

  const handleGenerateCrosshair = () => {
    setShowCrosshairForm((prev) => !prev);
  };

  return (
    <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin w-full overflow-y-auto pl-4 pr-2'>
      <div className='mb-6 flex items-center justify-between'>
        <PageTitle
          title={t("crosshairs.title")}
          subtitle={t("crosshairs.subtitle")}
        />
        <Button
          variant='outline'
          icon={
            showCrosshairForm ? (
              <ArrowLeftIcon className='h-4 w-4' />
            ) : (
              <CrosshairIcon className='h-4 w-4' />
            )
          }
          onClick={handleGenerateCrosshair}>
          {showCrosshairForm ? t("crosshairs.close") : t("crosshairs.generate")}
        </Button>
      </div>

      {showCrosshairForm && <CrosshairForm />}
      {!showCrosshairForm && (
        <>
          {" "}
          <ActiveCrosshairs /> <CrosshairLibrary />
        </>
      )}
    </div>
  );
};

export default Crosshairs;
