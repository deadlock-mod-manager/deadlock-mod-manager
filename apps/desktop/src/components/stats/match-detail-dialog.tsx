import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { MatchDetailView } from "@/components/stats/match-detail-view";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";

interface MatchDetailDialogProps {
  accountId: number;
  match: MatchHistoryEntry | null;
  heroesById: Map<number, DeadlockHero>;
  onOpenChange: (open: boolean) => void;
}

export const MatchDetailDialog = ({
  accountId,
  match,
  heroesById,
  onOpenChange,
}: MatchDetailDialogProps) => {
  if (!match) return null;

  const heroName = heroesById.get(match.hero_id)?.name ?? `#${match.hero_id}`;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto p-0'>
        <DialogTitle className='sr-only'>
          {heroName} · #{match.match_id}
        </DialogTitle>
        <MatchDetailView
          accountId={accountId}
          heroesById={heroesById}
          match={match}
        />
      </DialogContent>
    </Dialog>
  );
};
