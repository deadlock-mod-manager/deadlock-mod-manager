import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ArrowRightIcon, ScrollIcon } from "@phosphor-icons/react";
import { formatDistanceToNow, fromUnixTime } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PatchNotesDialog } from "@/components/patch-notes/patch-notes-dialog";
import { usePatchNotes } from "@/hooks/use-patch-notes";
import { type PatchNote, STEAM_NEWS_PAGE } from "@/lib/steam-news";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section-header";

const LIST_SIZE = 4;

const relativeDate = (note: PatchNote) =>
  formatDistanceToNow(fromUnixTime(note.publishedAt), { addSuffix: true });

const FEATURE_HEIGHT = "h-[300px]";

const KindLabel = ({ note }: { note: PatchNote }) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "font-semibold text-[10px] uppercase tracking-[0.2em]",
        note.isPatch ? "text-primary" : "text-muted-foreground",
      )}>
      {t(note.isPatch ? "patchNotes.kindPatch" : "patchNotes.kindAnnouncement")}
    </span>
  );
};

const LatestNote = ({
  note,
  onOpen,
}: {
  note: PatchNote;
  onOpen: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <button
      className={cn(
        "group/latest relative isolate flex w-full flex-col justify-end overflow-hidden rounded-xl border border-white/[0.06] bg-muted text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/60",
        FEATURE_HEIGHT,
      )}
      onClick={onOpen}
      type='button'>
      {note.image ? (
        <img
          alt=''
          className='absolute inset-0 -z-10 h-full w-full object-cover object-[center_70%] transition-transform duration-700 ease-out group-hover/latest:scale-[1.03] motion-reduce:transition-none'
          loading='lazy'
          src={note.image}
        />
      ) : (
        <div
          aria-hidden='true'
          className='absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-transparent to-transparent'
        />
      )}
      <div
        aria-hidden='true'
        className='absolute inset-0 -z-10 bg-gradient-to-t from-background from-15% via-background/70 via-45% to-transparent to-80%'
      />

      <div className='flex items-end justify-between gap-6 p-5'>
        <div className='min-w-0 max-w-[60ch] space-y-1.5'>
          <div className='flex items-center gap-3'>
            <KindLabel note={note} />
            <span className='text-muted-foreground text-xs'>
              {relativeDate(note)}
            </span>
          </div>
          <h3 className='font-semibold text-2xl text-foreground leading-tight tracking-tight'>
            {note.title}
          </h3>
          <p className='line-clamp-2 text-foreground/70 text-sm leading-relaxed'>
            {note.excerpt}
          </p>
        </div>
        <span className='hidden shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-background/60 px-3 py-1.5 font-medium text-primary text-xs backdrop-blur-sm transition-colors group-hover/latest:bg-primary group-hover/latest:text-primary-foreground sm:inline-flex'>
          {t("patchNotes.read")}
          <ArrowRightIcon
            className='size-3 transition-transform group-hover/latest:translate-x-0.5 motion-reduce:transition-none'
            weight='bold'
          />
        </span>
      </div>
    </button>
  );
};

const OlderNote = ({
  note,
  onOpen,
}: {
  note: PatchNote;
  onOpen: () => void;
}) => (
  <li className='flex-1'>
    <button
      className='group/row flex h-full w-full flex-col justify-center gap-1 border-border border-l-2 py-2 pr-2 pl-4 text-left transition-colors hover:border-primary hover:bg-primary/[0.04] focus-visible:border-primary focus-visible:bg-primary/[0.04] focus-visible:outline-none'
      onClick={onOpen}
      type='button'>
      <span className='flex items-center justify-between gap-3'>
        <KindLabel note={note} />
        <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>
          {relativeDate(note)}
        </span>
      </span>
      <span className='truncate font-medium text-foreground/90 text-sm transition-colors group-hover/row:text-primary'>
        {note.title}
      </span>
    </button>
  </li>
);

const SectionSkeleton = () => (
  <div className='grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'>
    <Skeleton className={cn("w-full rounded-xl", FEATURE_HEIGHT)} />
    <div className='flex flex-col gap-2'>
      {Array.from({ length: LIST_SIZE }, (_, i) => (
        <Skeleton className='h-[68px] w-full' key={i} />
      ))}
    </div>
  </div>
);

export const PatchNotesSection = () => {
  const { t } = useTranslation();
  const { data: notes, isPending, isError, refetch } = usePatchNotes();
  const [openNote, setOpenNote] = useState<PatchNote | null>(null);

  const [latest, ...older] = notes ?? [];

  return (
    <section className='relative w-full'>
      <SectionHeader
        icon={ScrollIcon}
        linkLabel={t("patchNotes.allOnSteam")}
        linkUrl={STEAM_NEWS_PAGE}
        title={t("patchNotes.title")}
      />

      {isPending ? (
        <SectionSkeleton />
      ) : isError ? (
        <div className='flex items-center justify-between gap-4 py-2'>
          <p className='text-muted-foreground text-sm'>
            {t("patchNotes.loadFailed")}
          </p>
          <Button onClick={() => refetch()} size='sm' variant='outline'>
            {t("common.retry")}
          </Button>
        </div>
      ) : !latest ? (
        <p className='py-2 text-muted-foreground text-sm'>
          {t("patchNotes.empty")}
        </p>
      ) : (
        <div className='grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'>
          <LatestNote note={latest} onOpen={() => setOpenNote(latest)} />
          {older.length > 0 && (
            <ul className='flex flex-col gap-1'>
              {older.map((note) => (
                <OlderNote
                  key={note.id}
                  note={note}
                  onOpen={() => setOpenNote(note)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <PatchNotesDialog note={openNote} onClose={() => setOpenNote(null)} />
    </section>
  );
};
