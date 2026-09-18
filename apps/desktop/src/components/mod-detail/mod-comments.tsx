import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { MessageSquare, Pin, ThumbsUp } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import { useModComments } from "@/hooks/use-mod-activity";
import type { CatalogCommentDto } from "@/types/generated/CatalogCommentDto";

interface ModCommentsProps {
  remoteId: string;
  remoteUrl: string;
}

export const ModComments = ({ remoteId, remoteUrl }: ModCommentsProps) => {
  const { t } = useTranslation();
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useModComments(remoteId);

  const firstPage = data?.pages[0];
  const comments = data?.pages.flatMap((page) => page.comments) ?? [];

  const openOnGameBanana = async () => {
    try {
      await openUrl(remoteUrl);
    } catch {
      toast.error(t("notifications.failedToOpenForumPost"));
    }
  };

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <MessageSquare className='h-4 w-4' />
          {t("modDetail.comments.title")}
          {firstPage && !firstPage.hidden && firstPage.total > 0 && (
            <Badge variant='secondary'>{firstPage.total}</Badge>
          )}
        </CardTitle>
        <CardDescription>{t("modDetail.comments.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-4'>
            {[0, 1, 2].map((row) => (
              <div className='flex gap-3' key={row}>
                <Skeleton className='h-9 w-9 rounded-full' />
                <div className='flex-1 space-y-2'>
                  <Skeleton className='h-3 w-32' />
                  <Skeleton className='h-4 w-3/4' />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className='flex items-center justify-between gap-2'>
            <p className='text-muted-foreground text-sm'>
              {t("modDetail.comments.loadError")}
            </p>
            <Button onClick={() => refetch()} size='sm' variant='outline'>
              {t("errors.tryAgain")}
            </Button>
          </div>
        ) : firstPage?.hidden ? (
          <p className='text-muted-foreground text-sm'>
            {t("modDetail.comments.hidden")}
          </p>
        ) : comments.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t("modDetail.comments.empty")}
          </p>
        ) : (
          <div className='space-y-4'>
            <ul className='divide-y divide-border/40'>
              {comments.map((comment) => (
                <CommentItem comment={comment} key={comment.id} />
              ))}
            </ul>
            <div className='flex items-center gap-2'>
              {hasNextPage && (
                <Button
                  isLoading={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  size='sm'
                  variant='outline'>
                  {t("modDetail.comments.loadMore")}
                </Button>
              )}
              <Button
                className='px-0'
                onClick={openOnGameBanana}
                size='sm'
                variant='link'>
                {t("modDetail.comments.replyOnGameBanana")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CommentItem = ({ comment }: { comment: CatalogCommentDto }) => {
  const { t } = useTranslation();
  const { author } = comment;

  return (
    <li className='flex gap-3 py-4 first:pt-0 last:pb-0'>
      <Avatar className='h-9 w-9'>
        {author.avatarUrl && (
          <AvatarImage alt={author.name} src={author.avatarUrl} />
        )}
        <AvatarFallback>{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
          <span className='font-medium'>{author.name}</span>
          {author.title && (
            <span className='truncate text-muted-foreground text-xs'>
              {author.title}
            </span>
          )}
          {comment.pinned && (
            <Badge className='gap-1' variant='outline'>
              <Pin className='h-3 w-3' />
              {t("modDetail.comments.pinned")}
            </Badge>
          )}
          <DateDisplay
            className='text-muted-foreground text-xs'
            date={new Date(comment.postedAt * 1000)}
          />
          {comment.score > 0 && (
            <span className='ml-auto flex items-center gap-1 text-muted-foreground text-xs'>
              <ThumbsUp className='h-3 w-3' />
              {comment.score}
            </span>
          )}
        </div>
        <GameBananaMarkup className='break-words' content={comment.text} />
        {comment.replyCount > 0 && (
          <p className='text-muted-foreground text-xs'>
            {t("modDetail.comments.replies", { count: comment.replyCount })}
          </p>
        )}
      </div>
    </li>
  );
};
