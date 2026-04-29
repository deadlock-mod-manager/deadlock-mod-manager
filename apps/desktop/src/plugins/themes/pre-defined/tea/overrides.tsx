import { useTranslation } from "react-i18next";
import type { ThemeOverrides } from "@/types/theme-overrides";
import { getPluginAssetUrl } from "@/lib/plugins";

const teaMascotUrl = getPluginAssetUrl(
  "themes",
  "public/pre-defined/tea/fumo_dog.png",
);

const SidebarContentExtra = () => {
  const { t } = useTranslation();

  return (
    <div className='group-data-[collapsible=icon]:hidden flex justify-center px-3 pb-4'>
      <img
        alt={t("accessibility.snipzteaMascotAlt")}
        className='max-w-[160px] w-full rounded-md object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]'
        src={teaMascotUrl}
      />
    </div>
  );
};

export const overrides: ThemeOverrides = {
  sidebarContentExtra: SidebarContentExtra,
};
