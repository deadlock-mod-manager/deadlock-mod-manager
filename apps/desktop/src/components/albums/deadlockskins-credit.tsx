import { toast } from "@deadlock-mods/ui/components/sonner";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { DEADLOCKSKINS_ORIGIN } from "@/lib/deadlockskins/albums";
import { cn } from "@/lib/utils";
import { DeadlockSkinsLogo } from "./deadlockskins-logo";

export const DeadlockSkinsCredit = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const openSite = useMutation({
    mutationFn: () => openUrl(`${DEADLOCKSKINS_ORIGIN}/albums`),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("albums.openSiteError")),
  });

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-muted-foreground text-xs",
        className,
      )}>
      {t("albums.providedBy")}
      <button
        className='group flex items-center gap-1.5 transition-colors hover:text-foreground'
        disabled={openSite.isPending}
        onClick={() => openSite.mutate()}
        type='button'>
        <DeadlockSkinsLogo className='h-4 w-4 shrink-0' />
        <span className='font-medium'>DeadlockSkins.gg</span>
        <ExternalLink className='h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100' />
      </button>
    </p>
  );
};
