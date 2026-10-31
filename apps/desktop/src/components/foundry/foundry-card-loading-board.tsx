import { ImageIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { FoundryCardAssembling } from "./foundry-assembling";

export const LoadingBoard = () => {
  const { t } = useTranslation();
  return (
    <div className='space-y-3 p-6'>
      <p className='flex items-center gap-2 text-muted-foreground text-xs'>
        <ImageIcon className='h-4 w-4' weight='duotone' />
        {t("foundry.cards.loading")}
      </p>
      <div className='flex gap-3'>
        {["one", "two", "three", "four"].map((slot) => (
          <div
            className='h-56 w-40 overflow-hidden rounded-md border bg-muted/30'
            key={slot}>
            <FoundryCardAssembling />
          </div>
        ))}
      </div>
    </div>
  );
};
