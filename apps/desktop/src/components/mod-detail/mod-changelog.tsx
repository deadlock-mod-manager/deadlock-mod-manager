import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { ChevronDown, History, Loader2 } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { Markup } from "interweave";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { DateDisplay } from "@/components/date-display";
import { useModChangelog } from "@/hooks/use-mod-changelog";
import { createMarkupLinkTransform } from "@/lib/markup-transform";
import type { ChangelogEntryDto } from "@/types/generated/ChangelogEntryDto";

interface ModChangelogProps {
  remoteId: string;
}

const categoryClassName = (category: string) => {
  switch (category.toLowerCase()) {
    case "addition":
    case "feature":
    case "release":
      return "border-emerald-500/40 text-emerald-400";
    case "bugfix":
      return "border-amber-500/40 text-amber-400";
    case "removal":
      return "border-red-500/40 text-red-400";
    default:
      return "border-sky-500/40 text-sky-400";
  }
};

export const ModChangelog = ({ remoteId }: ModChangelogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useModChangelog(remoteId);

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.entries) ?? [],
    [data],
  );

  if (entries.length === 0) {
    return null;
  }

  const latest = entries[0];
  const total = data?.pages[0]?.total ?? entries.length;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <Card className='shadow-none [contain:layout_style_paint]'>
        <CardHeader>
          <CollapsibleTrigger className='flex w-full items-center justify-between gap-4 text-left'>
            <CardTitle className='flex items-center gap-2'>
              <History className='h-4 w-4 text-muted-foreground' />
              {t("modDetail.changelog.title")}
              <Badge variant='secondary'>{total}</Badge>
            </CardTitle>
            <div className='flex min-w-0 items-center gap-3 text-muted-foreground text-sm'>
              {!open && (
                <span className='truncate'>
                  {t("modDetail.changelog.latest", {
                    title: latest.version ?? latest.title,
                  })}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className='space-y-4'>
            {entries.map((entry) => (
              <ChangelogEntry entry={entry} key={entry.id} />
            ))}
            {hasNextPage && (
              <Button
                className='w-full'
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                variant='outline'>
                {isFetchingNextPage && (
                  <Loader2 className='h-4 w-4 animate-spin' />
                )}
                {t("modDetail.changelog.loadMore")}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const ChangelogEntry = ({ entry }: { entry: ChangelogEntryDto }) => {
  const navigate = useNavigate();
  const markupTransform = useMemo(
    () => createMarkupLinkTransform(navigate),
    [navigate],
  );

  return (
    <div className='space-y-2 rounded-lg border border-border/30 bg-muted/20 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {entry.version && <Badge variant='outline'>v{entry.version}</Badge>}
        <span className='font-medium text-sm'>{entry.title}</span>
        {entry.createdAt != null && (
          <DateDisplay
            className='ml-auto text-muted-foreground text-xs'
            date={new Date(entry.createdAt * 1_000)}
          />
        )}
      </div>
      {entry.changes.length > 0 && (
        <ul className='space-y-1.5'>
          {entry.changes.map((change) => (
            <li
              className='flex items-start gap-2 text-sm'
              key={`${change.category}-${change.text}`}>
              {change.category && (
                <Badge
                  className={cn(
                    "shrink-0 text-[10px] uppercase",
                    categoryClassName(change.category),
                  )}
                  variant='outline'>
                  {change.category}
                </Badge>
              )}
              <span className='leading-relaxed'>{change.text}</span>
            </li>
          ))}
        </ul>
      )}
      {entry.text && (
        <div className='gamebanana-description prose prose-sm dark:prose-invert max-w-none'>
          <Markup
            className='whitespace-pre-line text-sm leading-relaxed'
            content={entry.text}
            transform={markupTransform}
          />
        </div>
      )}
    </div>
  );
};
