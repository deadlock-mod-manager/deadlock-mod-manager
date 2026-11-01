import { CheckCircle, Search } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { LocalAddonInfo } from "@/types/mods";
import { AddonSummaryCard } from "./addon-summary-card";

interface IdentifiedAddonsTabProps {
  identifiedAddons: LocalAddonInfo[];
  onAddToLibrary: (addon: LocalAddonInfo) => void;
}

export const IdentifiedAddonsTab = ({
  identifiedAddons,
  onAddToLibrary,
}: IdentifiedAddonsTabProps) => {
  const { t } = useTranslation();
  if (identifiedAddons.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-center'>
        <Search className='w-12 h-12 text-muted-foreground/50 mb-4' />
        <p className='text-muted-foreground'>
          {t("addons.noIdentifiedAddons")}
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 mb-4'>
        <div className='flex items-start gap-2'>
          <CheckCircle className='w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5' />
          <div className='text-xs text-green-800 dark:text-green-200'>
            <p className='font-medium mb-1'>Automatically Added</p>
            <p>
              These mods were recognized from our database and have been
              automatically added to your library with their correct information
              and marked as installed.
            </p>
          </div>
        </div>
      </div>
      {identifiedAddons.map((addon) => (
        <AddonSummaryCard
          key={addon.filePath}
          addon={addon}
          onAddToLibrary={onAddToLibrary}
        />
      ))}
    </div>
  );
};
