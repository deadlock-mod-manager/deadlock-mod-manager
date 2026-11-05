import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { History } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { useNativeSourceReleaseHistory } from "@/lib/mod-sources";

interface NativeSourceChangelogProps {
  remoteId: string;
  sourceName: string;
  currentReleaseId?: string;
}

export const NativeSourceChangelog = ({
  remoteId,
  sourceName,
  currentReleaseId,
}: NativeSourceChangelogProps) => {
  const { t } = useTranslation();
  const {
    data: releases = [],
    error,
    isLoading,
  } = useNativeSourceReleaseHistory(remoteId);

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <History className='h-4 w-4' />
          {t("modDetail.changelog.title")}
        </CardTitle>
        <CardDescription>
          {t("modSources.releaseHistoryDescription", { name: sourceName })}
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
            {t("modSources.releaseHistoryLoadError", { name: sourceName })}
          </p>
        ) : releases.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t("modSources.releaseHistoryEmpty", { name: sourceName })}
          </p>
        ) : (
          <div className='divide-y divide-border/40'>
            {releases.map((release) => (
              <article className='space-y-2 py-4 first:pt-0' key={release.id}>
                <header className='flex flex-wrap items-center gap-2'>
                  {release.version && (
                    <Badge className='font-mono' variant='secondary'>
                      v{release.version}
                    </Badge>
                  )}
                  {release.id === currentReleaseId && (
                    <Badge>{t("modSources.currentRelease")}</Badge>
                  )}
                  <DateDisplay
                    className='ml-auto text-muted-foreground text-xs'
                    date={
                      release.publishedAt ? new Date(release.publishedAt) : null
                    }
                  />
                </header>
                {release.changelog && (
                  <p className='whitespace-pre-wrap break-words text-sm leading-relaxed'>
                    {release.changelog}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
