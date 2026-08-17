import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Music, Shirt } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getModCategoryDisplayName } from "@/lib/constants";
import {
  type HeroAssignCandidate,
  heroAssignCandidates,
} from "@/lib/mods/hero-mods";
import type { LocalMod } from "@/types/mods";

interface AssignModDialogProps {
  hero: string;
  mods: LocalMod[];
  hidden: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (mod: LocalMod) => void;
}

const CandidateRow = ({
  candidate,
  onAssign,
}: {
  candidate: HeroAssignCandidate<LocalMod>;
  onAssign: (mod: LocalMod) => void;
}) => {
  const { t } = useTranslation();
  const { mod, kind, currentHero, hidden } = candidate;
  const Icon = kind === "skin" ? Shirt : Music;

  return (
    <button
      className='flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent'
      onClick={() => onAssign(mod)}
      type='button'>
      <Icon className='h-4 w-4 shrink-0 text-muted-foreground' />
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-sm'>{mod.name}</div>
        <div className='truncate text-muted-foreground text-xs'>
          {getModCategoryDisplayName(mod.category)}
          {currentHero &&
            ` · ${t("skins.assignCurrent", { hero: currentHero })}`}
        </div>
      </div>
      {hidden ? (
        <Badge className='shrink-0' variant='outline'>
          {t("skins.assignRemoved")}
        </Badge>
      ) : (
        currentHero === null && (
          <Badge className='shrink-0' variant='secondary'>
            {t("skins.assignUnrecognized")}
          </Badge>
        )
      )}
    </button>
  );
};

/**
 * Puts a mod on a hero's list by hand: the way back for anything removed from
 * one, and the way in for anything no hero could be detected for.
 */
export const AssignModDialog = ({
  hero,
  mods,
  hidden,
  open,
  onOpenChange,
  onAssign,
}: AssignModDialogProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const candidates = useMemo(
    () => heroAssignCandidates(mods, hero, hidden),
    [mods, hero, hidden],
  );

  const visible = candidates.filter((candidate) =>
    candidate.mod.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t("skins.assignTitle", { hero })}</DialogTitle>
          <DialogDescription>{t("skins.assignDescription")}</DialogDescription>
        </DialogHeader>
        <Input
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("skins.assignSearchPlaceholder")}
          value={query}
        />
        <div className='max-h-80 overflow-y-auto'>
          {visible.length === 0 ? (
            <p className='py-8 text-center text-muted-foreground text-sm'>
              {t("skins.assignEmpty")}
            </p>
          ) : (
            visible.map((candidate) => (
              <CandidateRow
                candidate={candidate}
                key={candidate.mod.remoteId}
                onAssign={onAssign}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
