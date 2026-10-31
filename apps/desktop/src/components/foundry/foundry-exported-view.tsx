import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { FoundryExportResult } from "@/types/foundry";
import { FoundryHeroAssembling } from "./foundry-assembling";
import { useFoundry } from "./foundry-context";
import { loadSilhouette, type Silhouette } from "./foundry-silhouettes";
import { type Change } from "./use-foundry-export-changes";
import { GROUP_ICONS } from "./foundry-export-change-row";

/** The finished hero, drawn in still embers, with the result under it. */
export const ExportedView = ({
  result,
  changes,
  heroStill,
  onClose,
}: {
  result: FoundryExportResult;
  changes: Change[];
  /** The finished hero, captured from the viewer when the sheet opened. */
  heroStill: string | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { manifest } = useFoundry();
  const hero = manifest?.heroDisplay ?? manifest?.hero ?? "";
  const [silhouette, setSilhouette] = useState<Silhouette | null>(null);
  useEffect(() => {
    if (hero) void loadSilhouette(hero).then(setSilhouette);
  }, [hero]);
  const counts = (["paint", "cards", "sounds", "files"] as const)
    .map((group) => ({
      group,
      count: changes.filter((change) => change.group === group).length,
    }))
    .filter(({ count }) => count > 0);
  const name = result.modName ?? hero;

  return (
    <div className='flex flex-1 flex-col items-center justify-center px-7 pb-6'>
      <div className='relative h-[300px] w-[260px]'>
        <div className='absolute inset-x-0 bottom-8 mx-auto h-24 w-56 rounded-[50%] bg-[radial-gradient(closest-side,rgb(242_138_75/0.3),transparent)]' />
        <FoundryHeroAssembling
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            heroStill && "opacity-40",
          )}
          silhouette={silhouette}
        />
        {heroStill && (
          <img
            alt={name}
            className='absolute inset-x-0 top-0 bottom-10 mx-auto h-[calc(100%-2.5rem)] w-auto animate-in fade-in-0 zoom-in-95 object-contain duration-700 [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_78%)]'
            src={heroStill}
          />
        )}
        <span className='absolute bottom-0 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-card bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.45)]'>
          <CheckIcon className='h-6 w-6' weight='bold' />
        </span>
      </div>
      <div className='space-y-1.5 py-5 text-center'>
        <h2 className='font-semibold text-lg'>
          {result.destination === "newMod"
            ? t("foundry.exportSheet.doneNewMod", { name })
            : result.destination === "replaceSource"
              ? t("foundry.export.replaced")
              : t("foundry.exportSheet.doneFile")}
        </h2>
        <p className='text-muted-foreground text-xs leading-[1.5]'>
          {result.destination === "newMod"
            ? t("foundry.exportSheet.doneNewModHint")
            : result.destination === "replaceSource"
              ? t("foundry.export.replacedHint")
              : t("foundry.export.success", { count: result.fileCount })}
        </p>
      </div>
      {counts.length > 0 && (
        <div className='flex flex-wrap justify-center gap-2 pb-5'>
          {counts.map(({ group, count }) => {
            const Icon = GROUP_ICONS[group];
            return (
              <span
                className='flex items-center gap-[5px] rounded-[5px] border bg-background px-2 py-1 font-medium text-[11px]'
                key={group}>
                <Icon className='h-3 w-3 text-secondary-foreground' />
                {t(`foundry.exportSheet.facts.${group}`, { count })}
              </span>
            );
          })}
        </div>
      )}
      <div className='w-full space-y-2'>
        {result.destination === "newMod" && (
          <Button
            className='h-10 w-full font-semibold'
            icon={<ArrowRightIcon className='h-4 w-4' />}
            onClick={() => navigate("/my-mods")}>
            {t("foundry.exportSheet.openMyMods")}
          </Button>
        )}
        <Button className='h-9 w-full' onClick={onClose} variant='outline'>
          {t("foundry.exportSheet.keepEditing")}
        </Button>
      </div>
    </div>
  );
};
