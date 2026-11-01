import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { FoundryExportResult } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { type Change } from "./use-foundry-export-changes";
import { GROUP_ICONS } from "./foundry-export-change-row";

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
  const counts = (["paint", "cards", "sounds", "files"] as const)
    .map((group) => ({
      group,
      count: changes.filter((change) => change.group === group).length,
    }))
    .filter(({ count }) => count > 0);
  const name = result.modName ?? hero;

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-2 pb-6'>
        {heroStill && (
          <div className='max-w-full shrink-0 self-center overflow-hidden rounded-lg border bg-background'>
            <img
              alt={name}
              className='h-56 max-w-full object-contain'
              src={heroStill}
            />
          </div>
        )}
        <div className='flex items-start gap-3' role='status'>
          <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
            <CheckIcon aria-hidden className='h-4 w-4' weight='bold' />
          </span>
          <div className='min-w-0 space-y-2'>
            <h2 className='break-words font-semibold text-base leading-snug'>
              {result.destination === "newMod"
                ? t("foundry.exportSheet.doneNewMod", { name })
                : result.destination === "replaceSource"
                  ? t("foundry.export.replaced")
                  : t("foundry.exportSheet.doneFile")}
            </h2>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              {result.destination === "newMod"
                ? t("foundry.exportSheet.doneNewModHint")
                : result.destination === "replaceSource"
                  ? t("foundry.export.replacedHint")
                  : t("foundry.export.success", { count: result.fileCount })}
            </p>
          </div>
        </div>
        {counts.length > 0 && (
          <div className='flex flex-wrap gap-2'>
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
      </div>
      <div className='shrink-0 space-y-2 border-t px-6 py-4'>
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
