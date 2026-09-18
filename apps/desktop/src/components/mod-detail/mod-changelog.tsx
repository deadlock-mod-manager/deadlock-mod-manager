import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { History } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChangelogEntry,
  isPublishedAfter,
} from "@/components/mod-detail/changelog-entry";
import { useModChangelog } from "@/hooks/use-mod-activity";

const INITIAL_VISIBLE = 3;
const VISIBLE_STEP = 10;

interface ModChangelogProps {
  remoteId: string;
  installedAt?: Date;
}

export const ModChangelog = ({ remoteId, installedAt }: ModChangelogProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useModChangelog(remoteId);

  const entries = data?.pages.flatMap((page) => page.entries) ?? [];

  // Most mods never post updates; an empty card would just be noise.
  if (!isLoading && !error && entries.length === 0) {
    return null;
  }

  const showMore = async () => {
    const next = visible + VISIBLE_STEP;
    if (next > entries.length && hasNextPage) {
      await fetchNextPage();
    }
    setVisible(next);
  };

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <History className='h-4 w-4' />
          {t("modDetail.changelog.title")}
        </CardTitle>
        <CardDescription>
          {t("modDetail.changelog.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-2'>
            <Skeleton className='h-4 w-1/3' />
            <Skeleton className='h-4 w-2/3' />
            <Skeleton className='h-4 w-1/2' />
          </div>
        ) : error ? (
          <p className='text-muted-foreground text-sm'>
            {t("modDetail.changelog.loadError")}
          </p>
        ) : (
          <div className='space-y-2'>
            <div className='divide-y divide-border/40'>
              {entries.slice(0, visible).map((entry) => (
                <ChangelogEntry
                  className='py-4 first:pt-0'
                  entry={entry}
                  isNew={isPublishedAfter(entry, installedAt)}
                  key={entry.id}
                />
              ))}
            </div>
            {(visible < entries.length || hasNextPage) && (
              <Button
                isLoading={isFetchingNextPage}
                onClick={showMore}
                size='sm'
                variant='outline'>
                {t("modDetail.changelog.showMore")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
