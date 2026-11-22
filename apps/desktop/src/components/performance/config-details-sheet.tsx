import { Sheet, SheetContent } from "@deadlock-mods/ui/components/sheet";
import { useState } from "react";
import { ConfigDetails } from "./details/config-details";
import { usePerformanceUi } from "./performance-context";

/** Right-hand sheet for a preset, GameBanana or user config. */
export const ConfigDetailsSheet = () => {
  const { detailsConfigId, openDetails } = usePerformanceUi();
  // Keep showing the last config while the sheet animates closed.
  const [shownConfigId, setShownConfigId] = useState(detailsConfigId);
  if (detailsConfigId !== null && detailsConfigId !== shownConfigId) {
    setShownConfigId(detailsConfigId);
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) openDetails(null);
      }}
      open={detailsConfigId !== null}>
      <SheetContent
        aria-describedby={undefined}
        className='flex w-full flex-col gap-0 p-0 sm:max-w-xl'
        side='right'>
        {shownConfigId && (
          <ConfigDetails configId={shownConfigId} key={shownConfigId} />
        )}
      </SheetContent>
    </Sheet>
  );
};
