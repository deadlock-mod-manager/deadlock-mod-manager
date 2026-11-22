import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** A topic folded to its title and one line, opened only when wanted. */
export const Topic = ({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) => (
  <Collapsible className='group/topic'>
    <CollapsibleTrigger className='flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'>
      <span className='min-w-0 flex-1'>
        <span className='block font-medium text-sm'>{title}</span>
        <span className='block text-muted-foreground text-xs'>{summary}</span>
      </span>
      <CaretDownIcon
        aria-hidden
        className='size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/topic:rotate-180'
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className='flex flex-col gap-3 px-5 pb-5 text-muted-foreground text-sm leading-relaxed'>
        {children}
      </div>
    </CollapsibleContent>
  </Collapsible>
);
