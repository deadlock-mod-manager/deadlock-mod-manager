import { Info, Search } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { LocalAddonInfo } from "@/types/mods";
import type { AnalysisTarget } from "@/lib/store/slices/mods";
import { AddonSummaryCard } from "./addon-summary-card";

interface IdentifiedAddonsTabProps {
  identifiedAddons: LocalAddonInfo[];
  onAddToLibrary: (addon: LocalAddonInfo) => void;
  fileContext?: AnalysisTarget | null;
}

export const IdentifiedAddonsTab = ({
  identifiedAddons,
  onAddToLibrary,
  fileContext,
}: IdentifiedAddonsTabProps) => {
  const { t } = useTranslation();

  if (identifiedAddons.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-center'>
        <Search className='w-12 h-12 text-muted-foreground/50 mb-4' />
        <p className='text-muted-foreground'>No mods were identified</p>
        <p className='text-sm text-muted-foreground/70 mt-1'>
          These addons might be custom or not in our database
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-md bg-muted/30 border p-3 mb-4'>
        <div className='flex items-start gap-2'>
          <Info className='w-4 h-4 text-muted-foreground shrink-0 mt-0.5' />
          <div className='text-xs text-muted-foreground'>
            <p className='font-medium mb-1 text-foreground'>
              {t("addons.identifiedNoticeTitle")}
            </p>
            <p>{t("addons.identifiedNoticeDescription")}</p>
          </div>
        </div>
      </div>
      {identifiedAddons.map((addon) => (
        <AddonSummaryCard
          key={addon.filePath}
          addon={addon}
          onAddToLibrary={onAddToLibrary}
          fileContext={fileContext}
        />
      ))}
    </div>
  );
};
