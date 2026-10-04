import { toast } from "@deadlock-mods/ui/components/sonner";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { DEADLOCKSKINS_ORIGIN } from "@/lib/deadlockskins/albums";
import { cn } from "@/lib/utils";

/** Albums are deadlockskins.gg's curation work, so they are always credited. */
export const DeadlockSkinsCredit = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const openSite = useMutation({
    mutationFn: () => openUrl(`${DEADLOCKSKINS_ORIGIN}/albums`),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("albums.openSiteError")),
  });

  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      {t("albums.curatedBy")}{" "}
      <button
        className='inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline'
        disabled={openSite.isPending}
        onClick={() => openSite.mutate()}
        type='button'>
        deadlockskins.gg
        <ExternalLink className='h-3.5 w-3.5' />
      </button>
    </p>
  );
};
