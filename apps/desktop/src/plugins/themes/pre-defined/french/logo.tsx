import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";

const iconUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/french/icon.png",
);

export function FrenchLogo() {
  const { t } = useTranslation();

  return (
    <img
      alt={t("plugins.french.logoAlt")}
      className='size-12 shrink-0 object-contain group-data-[collapsible=icon]:size-7'
      height={560}
      src={iconUrl}
      width={560}
    />
  );
}
