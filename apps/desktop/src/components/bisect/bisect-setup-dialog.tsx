import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import {
  BugBeetleIcon,
  InfoIcon,
  PlayCircleIcon,
  PlayIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  getEnabledMods,
  isBisectCandidate,
  useBisect,
} from "@/hooks/use-bisect";
import { estimateRounds } from "@/lib/bisect/search";
import { useBisectDialog } from "@/lib/bisect/dialogs";
import { usePersistedStore } from "@/lib/store";
import { ModThumb } from "./mod-thumb";

const SetupContent = () => {
  const { t } = useTranslation();
  const close = useBisectDialog((state) => state.close);
  const showExplainer = useBisectDialog((state) => state.showExplainer);
  const crashCheckEnabled = usePersistedStore(
    (state) => state.crashCheckEnabled,
  );
  const enabledMods = usePersistedStore(useShallow(getEnabledMods));
  const { run, isPending } = useBisect();
  const candidates = enabledMods.filter(isBisectCandidate);
  const leftOut = enabledMods.filter((mod) => !isBisectCandidate(mod));

  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const selected = candidates.filter((mod) => !unchecked.has(mod.remoteId));
  const visible = candidates.filter((mod) =>
    mod.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const { min, max } = estimateRounds(selected.length);

  const toggle = (remoteId: string, checked: boolean) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (checked) next.delete(remoteId);
      else next.add(remoteId);
      return next;
    });

  const start = () =>
    run(
      {
        type: "start",
        candidates: selected.map((mod) => mod.remoteId),
      },
      { onSettled: close },
    );

  if (candidates.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("bisect.setup.title")}</DialogTitle>
          <DialogDescription>{t("bisect.setup.noMods")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={close}>{t("bisect.setup.close")}</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader className='flex-row items-start gap-4 space-y-0 text-left'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/15'>
          <BugBeetleIcon className='size-5 text-primary' weight='duotone' />
        </div>
        <div className='space-y-1.5'>
          <DialogTitle>{t("bisect.setup.title")}</DialogTitle>
          <DialogDescription>
            {t("bisect.setup.description")}{" "}
            <button
              className='font-medium text-primary underline-offset-4 hover:underline'
              onClick={() => showExplainer("setup")}
              type='button'>
              {t("bisect.setup.howItWorks")}
            </button>
          </DialogDescription>
        </div>
      </DialogHeader>

      <section className='flex min-h-0 flex-1 flex-col gap-2'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className='font-semibold text-muted-foreground text-xs uppercase tracking-wide'>
            {t("bisect.setup.listHeading", {
              selected: selected.length,
              total: candidates.length,
            })}
          </h3>
          <Button
            className='h-7 px-2 text-xs'
            onClick={() =>
              setUnchecked(
                selected.length === candidates.length
                  ? new Set(candidates.map((mod) => mod.remoteId))
                  : new Set(),
              )
            }
            size='sm'
            variant='ghost'>
            {selected.length === candidates.length
              ? t("bisect.setup.selectNone")
              : t("bisect.setup.selectAll")}
          </Button>
        </div>
        {candidates.length > 8 && (
          <SearchInput
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("bisect.setup.search")}
            value={query}
          />
        )}
        <ul className='min-h-0 flex-1 divide-y overflow-y-auto rounded-md border'>
          {visible.map((mod) => {
            const id = `bisect-mod-${mod.remoteId}`;
            return (
              <li key={mod.remoteId}>
                <label
                  className='flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40'
                  htmlFor={id}>
                  <Checkbox
                    checked={!unchecked.has(mod.remoteId)}
                    id={id}
                    onCheckedChange={(checked) =>
                      toggle(mod.remoteId, checked === true)
                    }
                  />
                  <ModThumb className='size-8' mod={mod} />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm'>{mod.name}</span>
                    <span className='block truncate text-muted-foreground text-xs'>
                      {mod.author}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className='px-3 py-6 text-center text-muted-foreground text-sm'>
              {t("bisect.setup.noMatches")}
            </li>
          )}
        </ul>
        <p className='text-muted-foreground text-xs'>
          {t("bisect.setup.uncheckHint")}
        </p>
      </section>

      <ul className='space-y-2 text-sm'>
        <li className='flex items-start gap-2.5'>
          <PlayCircleIcon
            className='mt-0.5 size-4 shrink-0 text-primary'
            weight='duotone'
          />
          <span>
            {selected.length > 0
              ? t("bisect.setup.estimate", { min, max })
              : t("bisect.setup.pickOne")}
          </span>
        </li>
        <li className='flex items-start gap-2.5'>
          <ShieldCheckIcon
            className='mt-0.5 size-4 shrink-0 text-status-ok'
            weight='duotone'
          />
          <span>{t("bisect.setup.safe")}</span>
        </li>
        {leftOut.length > 0 && (
          <li className='flex items-start gap-2.5 text-muted-foreground'>
            <InfoIcon className='mt-0.5 size-4 shrink-0' weight='duotone' />
            <span>
              {t("bisect.setup.leftOut", {
                names: leftOut.map((mod) => mod.name).join(", "),
              })}
            </span>
          </li>
        )}
        {!crashCheckEnabled && (
          <li className='flex items-start gap-2.5 text-muted-foreground'>
            <InfoIcon className='mt-0.5 size-4 shrink-0' weight='duotone' />
            <span>{t("bisect.setup.crashCheckOff")}</span>
          </li>
        )}
      </ul>

      <DialogFooter>
        <Button disabled={isPending} onClick={close} variant='ghost'>
          {t("bisect.setup.cancel")}
        </Button>
        <Button disabled={selected.length === 0 || isPending} onClick={start}>
          <PlayIcon className='size-4' weight='fill' />
          {isPending ? t("bisect.setup.starting") : t("bisect.setup.start")}
        </Button>
      </DialogFooter>
    </>
  );
};

export const BisectSetupDialog = () => {
  const open = useBisectDialog((state) => state.dialog === "setup");
  const close = useBisectDialog((state) => state.close);
  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && close()} open={open}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-5 sm:max-w-xl'>
        {/* Mounted per opening, so each run starts with every mod checked. */}
        {open && <SetupContent />}
      </DialogContent>
    </Dialog>
  );
};
