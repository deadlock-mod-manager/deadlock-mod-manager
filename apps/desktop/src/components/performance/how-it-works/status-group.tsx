import { Badge } from "@deadlock-mods/ui/components/badge";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EntryStatus } from "@/types/generated/EntryStatus";
import { Term } from "./term";

/** The badge the settings editor shows for a status, so the glossary matches it. */
export const StatusBadge = ({ children }: { children: ReactNode }) => (
  <Badge
    className='px-1.5 py-0 font-normal text-[11px] text-muted-foreground'
    variant='outline'>
    {children}
  </Badge>
);

export const StatusGroup = ({
  title,
  statuses,
  extra,
}: {
  title: string;
  statuses: EntryStatus[];
  extra?: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <h4 className='mb-1 font-medium text-foreground text-xs uppercase tracking-wide'>
        {title}
      </h4>
      <dl>
        {statuses.map((status) => (
          <Term
            key={status}
            term={
              <StatusBadge>{t(`performance.status.${status}`)}</StatusBadge>
            }>
            {t(`performance.howItWorks.statuses.${status}`)}
          </Term>
        ))}
        {extra}
      </dl>
    </div>
  );
};
