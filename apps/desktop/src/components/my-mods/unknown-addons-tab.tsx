import { CheckCircle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { LocalAddonInfo } from "@/types/mods";
import { AddonSummaryCard } from "./addon-summary-card";

interface UnknownAddonsTabProps {
  unknownAddons: LocalAddonInfo[];
  onAddToLibrary: (addon: LocalAddonInfo) => void;
}

export const UnknownAddonsTab = ({
  unknownAddons,
  onAddToLibrary,
}: UnknownAddonsTabProps) => {
  const { t } = useTranslation();
  if (unknownAddons.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-center'>
        <CheckCircle className='w-12 h-12 text-muted-foreground/50 mb-4' />
        <p className='text-muted-foreground'>{t("addons.noUnmatchedAddons")}</p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {unknownAddons.map((addon) => (
        <AddonSummaryCard
          key={addon.filePath}
          addon={addon}
          onAddToLibrary={onAddToLibrary}
        />
      ))}
    </div>
  );
};
