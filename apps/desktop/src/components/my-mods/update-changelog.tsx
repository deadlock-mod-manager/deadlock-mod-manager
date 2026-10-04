import { Loader2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  ChangelogEntry,
  isPublishedAfter,
} from "@/components/mod-detail/changelog-entry";
import { useModChangelog } from "@/hooks/use-mod-activity";

interface UpdateChangelogProps {
  remoteId: string;
  installedAt?: Date;
}

export const UpdateChangelog = ({
  remoteId,
  installedAt,
}: UpdateChangelogProps) => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useModChangelog(remoteId);

  if (isLoading) {
    return (
      <p className='flex items-center gap-2 text-muted-foreground text-xs'>
        <Loader2 className='h-3 w-3 animate-spin' />
        {t("myMods.batchUpdate.changelogLoading")}
      </p>
    );
  }
  if (error) {
    return null;
  }

  // Only the first page: the mod page has the full history.
  const newEntries =
    data?.pages[0]?.entries.filter((entry) =>
      isPublishedAfter(entry, installedAt),
    ) ?? [];

  if (newEntries.length === 0) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t("myMods.batchUpdate.changelogEmpty")}
      </p>
    );
  }

  return (
    <div className='space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3'>
      <p className='font-medium text-sm'>
        {t("myMods.batchUpdate.changelogTitle", { count: newEntries.length })}
      </p>
      <div className='max-h-60 space-y-3 overflow-y-auto pr-1'>
        {newEntries.map((entry) => (
          <ChangelogEntry entry={entry} key={entry.id} />
        ))}
      </div>
    </div>
  );
};
