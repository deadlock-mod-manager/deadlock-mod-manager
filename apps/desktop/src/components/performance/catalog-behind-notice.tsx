import { useCatalogBehind } from "@/hooks/performance/use-catalog-behind";
import { useRefreshPerfCatalog } from "@/hooks/performance/use-perf-mutations";
import { InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** The game updated past the catalog's convar list; it catches up with the next catalog update. */
export const CatalogBehindNotice = () => {
  const { t } = useTranslation();
  const behind = useCatalogBehind();
  const refreshMutation = useRefreshPerfCatalog();
  if (!behind) return null;
  return (
    <p className='mt-2 flex items-start gap-1.5 px-1 text-muted-foreground text-xs'>
      <InfoIcon aria-hidden className='mt-0.5 size-3.5 shrink-0' />
      <span>
        {t("performance.activeStatus.catalogBehind", behind)}{" "}
        <button
          className='font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50'
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
          type='button'>
          {t("performance.activeStatus.checkForUpdates")}
        </button>
      </span>
    </p>
  );
};
