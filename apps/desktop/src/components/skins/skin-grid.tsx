import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Plus, Shirt } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DefaultSkinCard, SkinCard } from "@/components/skins/skin-card";
import type { LocalMod } from "@/types/mods";

interface SkinGridProps {
  hero: string;
  skins: LocalMod[];
  activeIds: Set<string>;
  disabled: boolean;
  onSelect: (mod: LocalMod | null) => void;
  onAddSkin: () => void;
  onDelete: (mod: LocalMod) => void;
}

export const SkinGrid = ({
  hero,
  skins,
  activeIds,
  disabled,
  onSelect,
  onAddSkin,
  onDelete,
}: SkinGridProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex-1 overflow-y-auto pr-2'>
      <div className='mb-4 flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <h2 className='font-semibold text-xl'>{hero}</h2>
          <p className='text-muted-foreground text-sm'>
            {t("skins.skinsDownloaded", { count: skins.length })}
          </p>
        </div>
        <Button className='shrink-0' onClick={onAddSkin} size='sm'>
          <Plus className='h-4 w-4' />
          {t("skins.addSkin")}
        </Button>
      </div>
      {skins.length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <Shirt className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("skins.emptyTitle", { hero })}</EmptyTitle>
            <EmptyDescription>{t("skins.noSkinsHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onAddSkin}>
              <Plus className='h-4 w-4' />
              {t("skins.addSkinFor", { hero })}
            </Button>
          </EmptyContent>
        </Empty>
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
              onDelete={() => onDelete(mod)}
              onSelect={() => onSelect(mod)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
