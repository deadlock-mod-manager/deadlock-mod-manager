import { ProhibitIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export const WithheldBadge = () => {
  const { t } = useTranslation();
  return (
    <span className='inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300 text-xs'>
      <ProhibitIcon className='size-3' weight='bold' />
      {t("modDetail.withheld.badge")}
    </span>
  );
};
