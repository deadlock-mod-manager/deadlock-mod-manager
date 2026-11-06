import { Button } from "@deadlock-mods/ui/components/button";
import { Check, Loader2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

export type RecapAction = {
  label: string;
  /** False while another row is installing; the file selector is shared. */
  available: boolean;
  enable: (mod: LocalMod) => void;
};

export const RecapRowAction = ({
  mod,
  action,
}: {
  mod: LocalMod;
  action: RecapAction;
}) => {
  const { t } = useTranslation();
  // The recap is a snapshot; the store says whether the mod got enabled since.
  const liveMod = usePersistedStore((state) =>
    state.localMods.find((m) => m.remoteId === mod.remoteId),
  );

  if (liveMod?.status === ModStatus.Installed) {
    return (
      <span className='flex shrink-0 items-center gap-1 text-xs text-green-500'>
        <Check className='h-3.5 w-3.5' />
        {t("myMods.enableAllRecap.enabled")}
      </span>
    );
  }
  if (liveMod?.status === ModStatus.Installing) {
    return (
      <Loader2 className='h-4 w-4 shrink-0 animate-spin text-muted-foreground' />
    );
  }
  if (liveMod?.status !== ModStatus.Downloaded) return null;

  return (
    <Button
      size='sm'
      variant='outline'
      className='shrink-0'
      disabled={!action.available}
      onClick={() => action.enable(liveMod)}>
      {action.label}
    </Button>
  );
};
