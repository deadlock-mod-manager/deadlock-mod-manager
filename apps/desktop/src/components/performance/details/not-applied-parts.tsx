import { Button } from "@deadlock-mods/ui/components/button";
import {
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { EntryKey, entryKey } from "./details-parts";

/** Building blocks shared by the cards in the "Left out or ignored" section. */
export const NotAppliedCard = ({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className='flex gap-3 rounded-md border bg-muted/10 p-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0'>
    {icon}
    <div className='min-w-0 flex-1'>
      <div className='flex items-center justify-between gap-3'>
        <p className='font-medium text-sm'>{title}</p>
        {action}
      </div>
      <div className='mt-1 text-muted-foreground text-xs'>{children}</div>
    </div>
  </div>
);

export const ViewToggle = () => {
  const { t } = useTranslation();
  return (
    <CollapsibleTrigger asChild>
      <Button
        className='group h-6 gap-1 px-1.5 text-xs'
        size='sm'
        variant='ghost'>
        {t("performance.details.notApplied.view")}
        <CaretDownIcon
          aria-hidden
          className='transition-transform group-data-[state=open]:rotate-180'
        />
      </Button>
    </CollapsibleTrigger>
  );
};

export const EntryList = ({
  entries,
  detail,
}: {
  entries: ResolvedEntry[];
  detail: (entry: ResolvedEntry) => string;
}) => (
  <CollapsibleContent>
    <ul className='mt-2 max-h-64 overflow-y-auto pr-1'>
      {entries.map((entry) => (
        <li
          className='flex min-w-0 items-center gap-2 py-0.5 leading-5'
          key={entryKey(entry)}>
          <EntryKey className='shrink-0 text-foreground' entry={entry} />
          <span className='min-w-0 truncate' title={detail(entry)}>
            {detail(entry)}
          </span>
        </li>
      ))}
    </ul>
  </CollapsibleContent>
);
