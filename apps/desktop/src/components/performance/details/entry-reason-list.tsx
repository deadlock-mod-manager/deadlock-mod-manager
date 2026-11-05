import { Collapsible } from "@deadlock-mods/ui/components/collapsible";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { useEntryReason } from "./details-parts";
import { EntryList, NotAppliedCard, ViewToggle } from "./not-applied-parts";

export const EntryReasonList = ({
  title,
  icon,
  summary,
  entries,
}: {
  title: string;
  icon: ReactNode;
  summary: string;
  entries: ResolvedEntry[];
}) => {
  const reasonFor = useEntryReason();
  return (
    <Collapsible>
      <NotAppliedCard action={<ViewToggle />} icon={icon} title={title}>
        <p>{summary}</p>
        <EntryList detail={reasonFor} entries={entries} />
      </NotAppliedCard>
    </Collapsible>
  );
};
