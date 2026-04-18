import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { GameControllerIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ServerDetailEmptyStateProps {
  className?: string;
}

const ServerDetailEmptyState = ({ className }: ServerDetailEmptyStateProps) => {
  const { t } = useTranslation();
  return (
    <aside
      className={cn(
        "hidden h-full w-[360px] shrink-0 flex-col rounded-lg border border-border/60 bg-card p-6 lg:flex",
        className,
      )}>
      <Empty className='m-auto'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <GameControllerIcon className='size-12' weight='duotone' />
          </EmptyMedia>
          <EmptyTitle>{t("servers.title")}</EmptyTitle>
          <EmptyDescription>{t("servers.subtitle")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </aside>
  );
};

export default ServerDetailEmptyState;
