import type { ModAuthorDto, ModDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CalendarDays,
  Download,
  ExternalLink,
  Heart,
  Package,
  Users,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { isTrustedExternalUrl } from "@/lib/trusted-external-url";
import { AuthorStatPill } from "./author-stat-pill";

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

const formatMemberSince = (joinedAt: number, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  }).format(new Date(joinedAt * 1000));

interface AuthorProfileHeaderProps {
  author: ModAuthorDto;
  mods: ModDto[];
}

export const AuthorProfileHeader = ({
  author,
  mods: authorMods,
}: AuthorProfileHeaderProps) => {
  const { t, i18n } = useTranslation();
  const openProfile = useMutation({
    mutationFn: () => openUrl(author.profileUrl),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("authorPage.openProfileError")),
  });
  const displayName = author.name;
  const avatarUrl = author.hdAvatarUrl || author.avatarUrl;
  const canOpenProfile = isTrustedExternalUrl(author.profileUrl);
  const headerImage = authorMods.find(
    (mod) => !mod.isNSFW && mod.images.length > 0,
  )?.images[0];
  const totals = { downloads: 0, likes: 0 };
  for (const mod of authorMods) {
    totals.downloads += mod.downloadCount;
    totals.likes += mod.likes;
  }

  return (
    <section className='relative mb-6 min-h-48 overflow-hidden rounded-lg border bg-card'>
      {headerImage && (
        <img
          alt=''
          aria-hidden='true'
          className='absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_right,transparent_0%,black_45%,black_100%)]'
          src={headerImage}
        />
      )}
      <div className='relative flex min-h-48 items-end gap-5 bg-gradient-to-t from-background via-background/85 to-background/20 p-6'>
        <Avatar className='h-24 w-24 border-2 border-background shadow-lg'>
          <AvatarImage alt={displayName} src={avatarUrl} />
          <AvatarFallback className='text-xl'>
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className='min-w-0 flex-1 pb-1'>
          <p className='mb-1 text-muted-foreground text-sm'>
            {t("authorPage.submittedBy")}
          </p>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <h1 className='truncate font-semibold text-3xl tracking-tight'>
              {displayName}
            </h1>
            {author.title && (
              <span className='rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs'>
                {author.title}
              </span>
            )}
          </div>
          {author.upicUrl && (
            <img
              alt={t("authorPage.upicAlt", { author: displayName })}
              className='mt-2 max-h-10 max-w-56 object-contain object-left'
              src={author.upicUrl}
            />
          )}
          {(author.joinedAt !== null || (author.subscriberCount ?? 0) > 0) && (
            <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs'>
              {author.joinedAt !== null && (
                <span className='inline-flex items-center gap-1.5'>
                  <CalendarDays className='h-3.5 w-3.5' />
                  {t("authorPage.memberSince", {
                    date: formatMemberSince(author.joinedAt, i18n.language),
                  })}
                </span>
              )}
              {(author.subscriberCount ?? 0) > 0 && (
                <span className='inline-flex items-center gap-1.5'>
                  <Users className='h-3.5 w-3.5' />
                  {t("authorPage.subscriberCount", {
                    count: author.subscriberCount,
                  })}
                </span>
              )}
            </div>
          )}
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <AuthorStatPill
              icon={<Package className='h-3.5 w-3.5' />}
              label={t("authorPage.modStat", {
                count: authorMods.length,
              })}
              value={authorMods.length.toLocaleString()}
            />
            <AuthorStatPill
              icon={<Download className='h-3.5 w-3.5' />}
              label={t("authorPage.downloadStat", {
                count: totals.downloads,
              })}
              value={totals.downloads.toLocaleString()}
            />
            <AuthorStatPill
              icon={<Heart className='h-3.5 w-3.5' />}
              label={t("authorPage.likeStat", { count: totals.likes })}
              value={totals.likes.toLocaleString()}
            />
          </div>
        </div>
        <div className='flex shrink-0 flex-col items-end gap-3'>
          {author.signatureUrl && (
            <img
              alt={t("authorPage.signatureAlt", {
                author: displayName,
              })}
              className='max-h-14 max-w-56 object-contain object-right'
              src={author.signatureUrl}
            />
          )}
          {canOpenProfile && (
            <Button
              disabled={openProfile.isPending}
              onClick={() => openProfile.mutate()}
              variant='outline'>
              {t("authorPage.viewOnGameBanana")}
              <ExternalLink className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};
