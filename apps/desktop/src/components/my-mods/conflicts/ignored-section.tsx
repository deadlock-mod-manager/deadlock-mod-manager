import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { ChevronDown } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useConflictIgnore } from "@/hooks/use-profile-conflicts";
import type { ModConflict } from "@/types/generated/ModConflict";
import type { LocalMod } from "@/types/mods";
import { modDisplayName } from "./conflict-group-row";
import { IgnoredRow } from "./ignored-row";

export const IgnoredSection = ({
  ignored,
  ignoredMods,
  modsById,
}: {
  ignored: ModConflict[];
  ignoredMods: string[];
  modsById: ReadonlyMap<string, LocalMod>;
}) => {
  const { t } = useTranslation();
  const ignore = useConflictIgnore();
  const total = ignored.length + ignoredMods.length;
  if (total === 0) {
    return null;
  }

  return (
    <Collapsible className='mt-2'>
      <div className='flex items-center justify-between'>
        <CollapsibleTrigger className='group flex items-center gap-1.5 rounded-sm text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60'>
          <ChevronDown
            aria-hidden
            className='h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90'
          />
          {t("conflicts.markedFineSection", { count: total })}
        </CollapsibleTrigger>
        <Button
          disabled={ignore.isPending}
          onClick={() => ignore.mutate([{ type: "clearAll" }])}
          size='sm'
          variant='ghost'>
          {t("conflicts.clearIgnores")}
        </Button>
      </div>
      <CollapsibleContent>
        <ul className='mt-2 divide-y rounded-lg border'>
          {ignored.map((conflict) => (
            <IgnoredRow
              disabled={ignore.isPending}
              key={`${conflict.winner}::${conflict.loser}`}
              label={
                conflict.ignoreReason === "files"
                  ? t("conflicts.ignoredFilesRow", {
                      first: modDisplayName(modsById, conflict.winner),
                      second: modDisplayName(modsById, conflict.loser),
                      count: conflict.files.length,
                    })
                  : t("conflicts.ignoredPair", {
                      first: modDisplayName(modsById, conflict.winner),
                      second: modDisplayName(modsById, conflict.loser),
                    })
              }
              onRestore={
                conflict.ignoreReason === "mod"
                  ? undefined
                  : () =>
                      ignore.mutate([
                        {
                          type: "unignorePair",
                          modA: conflict.winner,
                          modB: conflict.loser,
                        },
                      ])
              }
              testId='ignored-conflict'
            />
          ))}
          {ignoredMods.map((modId) => (
            <IgnoredRow
              disabled={ignore.isPending}
              key={modId}
              label={t("conflicts.ignoredModRow", {
                mod: modDisplayName(modsById, modId),
              })}
              onRestore={() => ignore.mutate([{ type: "unignoreMod", modId }])}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};
