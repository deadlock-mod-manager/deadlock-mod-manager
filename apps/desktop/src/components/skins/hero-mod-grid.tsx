import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Link2, Plus, Shirt } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DefaultSkinCard, HeroModCard } from "@/components/skins/hero-mod-card";
import type { HeroModGroup, HeroModKind } from "@/lib/mods/hero-mods";
import type { LocalMod } from "@/types/mods";

interface HeroModGridProps {
  hero: string;
  group: HeroModGroup<LocalMod>;
  disabled: boolean;
  /** Which skin the 3D panel is showing: a mod id, or null for the default. */
  previewedId: string | null;
  onSelect: (mod: LocalMod | null, kind: HeroModKind) => void;
  onPreview: (mod: LocalMod | null) => void;
  onBrowseSkins: () => void;
  onAssignMod: () => void;
  onRemove: (mod: LocalMod) => void;
  onDelete: (mod: LocalMod) => void;
}

export const HeroModGrid = ({
  hero,
  group,
  disabled,
  previewedId,
  onSelect,
  onPreview,
  onBrowseSkins,
  onAssignMod,
  onRemove,
  onDelete,
}: HeroModGridProps) => {
  const { t } = useTranslation();
  const { skins, extras } = group;
  const activeIds = new Set(
    [...group.activeSkins, ...group.activeExtras].map((mod) => mod.remoteId),
  );

  const renderCards = (mods: LocalMod[], kind: HeroModKind) =>
    mods.map((mod) => (
      <HeroModCard
        disabled={disabled}
        hero={hero}
        isActive={activeIds.has(mod.remoteId)}
        isPreviewing={kind === "skin" && previewedId === mod.remoteId}
        key={mod.remoteId}
        kind={kind}
        mod={mod}
        onDelete={() => onDelete(mod)}
        onPreview={kind === "skin" ? () => onPreview(mod) : undefined}
        onRemove={() => onRemove(mod)}
        onSelect={() => onSelect(mod, kind)}
      />
    ));

  const assignButton = (
    <Button
      className='shrink-0'
      disabled={disabled}
      onClick={onAssignMod}
      size='sm'
      variant='outline'>
      <Link2 className='h-4 w-4' />
      {t("skins.assignMod")}
    </Button>
  );

  return (
    <div className='flex-1 overflow-y-auto pr-2'>
      <div className='mb-4 flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <h2 className='font-semibold text-xl'>{hero}</h2>
          <p className='text-muted-foreground text-sm'>
            {t("skins.skinsDownloaded", { count: skins.length })}
            {extras.length > 0 &&
              ` · ${t("skins.extrasCount", { count: extras.length })}`}
          </p>
        </div>
        <div className='flex shrink-0 gap-2'>
          {assignButton}
          <Button disabled={disabled} onClick={onBrowseSkins} size='sm'>
            <Plus className='h-4 w-4' />
            {t("skins.addSkin")}
          </Button>
        </div>
      </div>

      {skins.length === 0 && extras.length === 0 ? (
        <Empty className='py-12'>
          <EmptyHeader>
            <EmptyMedia variant='default'>
              <Shirt className='h-16 w-16' />
            </EmptyMedia>
            <EmptyTitle>{t("skins.emptyTitle", { hero })}</EmptyTitle>
            <EmptyDescription>{t("skins.noSkinsHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className='flex flex-wrap justify-center gap-2'>
              <Button disabled={disabled} onClick={onBrowseSkins}>
                <Plus className='h-4 w-4' />
                {t("skins.addSkinFor", { hero })}
              </Button>
              {assignButton}
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <div className='flex flex-col gap-6'>
          {/* The default card belongs to the skins, so it goes with them rather
              than sitting above an empty section when a hero only has extras. */}
          {skins.length > 0 && (
            <div className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'>
              <DefaultSkinCard
                disabled={disabled}
                isActive={group.activeSkins.length === 0}
                isPreviewing={previewedId === null}
                onPreview={() => onPreview(null)}
                onSelect={() => onSelect(null, "skin")}
              />
              {renderCards(skins, "skin")}
            </div>
          )}
          {extras.length > 0 && (
            <div className='flex flex-col gap-2'>
              <div>
                <h3 className='font-semibold text-sm'>{t("skins.extras")}</h3>
                <p className='text-muted-foreground text-xs'>
                  {t("skins.extrasHint")}
                </p>
              </div>
              <div className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4'>
                {renderCards(extras, "extra")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
