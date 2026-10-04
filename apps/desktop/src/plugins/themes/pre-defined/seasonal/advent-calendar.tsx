import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deadlock-mods/ui/components/dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ART, type ArtId } from "./art";
import { openAdventDoor, useAdventDoors } from "./progress";

/** Doors are scattered like on a paper calendar; finding today's door is part of the fun. */
const DOOR_ORDER = [
  7, 15, 2, 22, 11, 19, 4, 13, 24, 9, 17, 1, 20, 6, 14, 3, 23, 10, 18, 5, 12,
  21, 8, 16,
];

const TREATS: ArtId[] = [
  "gingerbread",
  "candyCane",
  "bauble",
  "cocoa",
  "snowman",
  "bell",
  "cookie",
  "mitten",
  "present",
  "stocking",
  "candle",
];

const treatFor = (door: number): ArtId =>
  door === 24 ? "star" : TREATS[(door - 1) % TREATS.length];

export const AdventCalendar = () => {
  const { t } = useTranslation();
  const [lastOpened, setLastOpened] = useState<number>();
  const today = new Date();
  const year = today.getFullYear();
  const opened = useAdventDoors(year);
  // In December the doors keep to the date; a theme forced out of season opens all of them.
  const inDecember = today.getMonth() === 11;
  const canOpen = (door: number) => !inDecember || door <= today.getDate();
  const waiting = DOOR_ORDER.filter(
    (door) => canOpen(door) && !opened.includes(door),
  ).length;

  const treatName = (door: number) =>
    t(`plugins.seasonal.items.${treatFor(door)}`);

  return (
    <Dialog onOpenChange={() => setLastOpened(undefined)}>
      <DialogTrigger asChild>
        <Button
          size='sm'
          variant='outline'
          type='button'
          className='w-full justify-between gap-2'
          aria-label={
            waiting > 0
              ? t("plugins.seasonal.advent.openWaiting", { count: waiting })
              : t("plugins.seasonal.advent.open")
          }>
          <span className='truncate'>{t("plugins.seasonal.advent.open")}</span>
          {waiting > 0 ? (
            <span className='seasonal-count-badge'>{waiting}</span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t("plugins.seasonal.advent.title")}</DialogTitle>
          <DialogDescription>
            {t("plugins.seasonal.advent.description", {
              opened: opened.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='seasonal-advent-grid'>
          {DOOR_ORDER.map((door) => {
            const isOpen = opened.includes(door);
            const locked = !canOpen(door);
            const Treat = ART[treatFor(door)];
            return (
              <button
                key={door}
                type='button'
                className='seasonal-advent-door'
                data-open={isOpen}
                data-locked={locked}
                data-big={door === 24}
                disabled={locked}
                aria-label={
                  isOpen
                    ? treatName(door)
                    : t("plugins.seasonal.advent.door", { door })
                }
                title={
                  locked
                    ? t("plugins.seasonal.advent.locked", { door })
                    : undefined
                }
                onClick={() => {
                  if (isOpen) return;
                  openAdventDoor(year, door);
                  setLastOpened(door);
                }}>
                <span className='seasonal-advent-inside'>
                  <Treat />
                </span>
                <span className='seasonal-advent-flap' aria-hidden>
                  {door}
                </span>
              </button>
            );
          })}
        </div>
        <p className='text-sm text-muted-foreground' aria-live='polite'>
          {lastOpened === 24
            ? t("plugins.seasonal.advent.christmasEve")
            : lastOpened
              ? t("plugins.seasonal.advent.revealed", {
                  door: lastOpened,
                  item: treatName(lastOpened),
                })
              : t("plugins.seasonal.advent.hint")}
        </p>
      </DialogContent>
    </Dialog>
  );
};
