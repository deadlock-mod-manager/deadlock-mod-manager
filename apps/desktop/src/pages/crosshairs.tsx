import { Button } from "@deadlock-mods/ui/components/button";
import { CrosshairIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActiveCrosshairs } from "@/components/crosshairs/active-crosshairs";
import { CrosshairDialog } from "@/components/crosshairs/crosshair-dialog";
import { CrosshairLibrary } from "@/components/crosshairs/crosshair-library";
import { CrosshairsToggle } from "@/components/settings/crosshairs-toggle";
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
          icon={<CrosshairIcon className='h-4 w-4' />}
          onClick={handleGenerateCrosshair}>
          {t("crosshairs.generate")}
        </Button>
      </div>
      <div className='mb-6'>
        <CrosshairsToggle />
      </div>
      <ActiveCrosshairs />
      <CrosshairLibrary />
      <CrosshairDialog
        open={showCrosshairForm}
        onOpenChange={setShowCrosshairForm}
      />
    </div>
  );
};

export default Crosshairs;
