import { useTranslation } from "react-i18next";
import { DefaultSkinCard, SkinCard } from "@/components/skins/skin-card";
import type { LocalMod } from "@/types/mods";

interface SkinGridProps {
  hero: string;
  skins: LocalMod[];
  activeIds: Set<string>;
  disabled: boolean;
  onSelect: (mod: LocalMod | null) => void;
}

export const SkinGrid = ({
  hero,
  skins,
  activeIds,
  disabled,
  onSelect,
}: SkinGridProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex-1 overflow-y-auto pr-2'>
      <div className='mb-4'>
        <h2 className='font-semibold text-xl'>{hero}</h2>
        <p className='text-muted-foreground text-sm'>
          {t("skins.skinsDownloaded", { count: skins.length })}
        </p>
      </div>
      {skins.length === 0 ? (
        <p className='max-w-md text-muted-foreground text-sm'>
          {t("skins.noSkinsHint")}
        </p>
      ) : (
        <div className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'>
          <DefaultSkinCard
            disabled={disabled}
            isActive={activeIds.size === 0}
            onSelect={() => onSelect(null)}
          />
          {skins.map((mod) => (
            <SkinCard
              disabled={disabled}
              isActive={activeIds.has(mod.remoteId)}
              key={mod.remoteId}
              mod={mod}
              onSelect={() => onSelect(mod)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
