import { Badge } from "@deadlock-mods/ui/components/badge";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { unmetRequirements } from "@/lib/mods/requirements";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

export function RequirementWarning({ mod }: { mod: LocalMod }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const count = usePersistedStore((state) =>
    mod.status === ModStatus.Installed
      ? unmetRequirements(mod.dependencies ?? [], state.localMods).length
      : 0,
  );
  if (!count) return null;
  return (
    <Badge
      asChild
      variant='outline'
      className='cursor-pointer border-amber-500/50 bg-background/95 text-amber-600 dark:text-amber-400'>
      <button
        type='button'
        onClick={(event) => {
          event.stopPropagation();
          navigate(`/mods/${mod.remoteId}`);
        }}>
        {t("modDependencies.unmetCount", { count })}
      </button>
    </Badge>
  );
}
