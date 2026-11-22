import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RowButton } from "@/components/plugins/manage/row-button";
import { useInstallFromCatalog } from "@/components/plugins/manage/use-install-plugin";
import { type CatalogEntry } from "@/lib/plugins/catalog";

/** Install for published entries; a disabled button that says why otherwise. */
export const InstallButton = ({
  entry,
  className,
  children,
}: {
  entry: CatalogEntry;
  className?: string;
  children?: ReactNode;
}) => {
  const { t } = useTranslation();
  const install = useInstallFromCatalog();
  const { archive } = entry;
  if (!archive) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='flex shrink-0' tabIndex={0}>
            <RowButton
              className={className}
              disabled
              icon={DownloadSimpleIcon}
              variant='primary'>
              {children ?? t("plugins.discover.install")}
            </RowButton>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("plugins.discover.notPublished")}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <RowButton
      className={className}
      disabled={install.isPending}
      icon={DownloadSimpleIcon}
      onClick={() => install.mutate(archive)}
      variant='primary'>
      {install.isPending
        ? t("plugins.discover.installing")
        : (children ?? t("plugins.discover.install"))}
    </RowButton>
  );
};
