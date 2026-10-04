import { Badge } from "@deadlock-mods/ui/components/badge";
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
import { Input } from "@deadlock-mods/ui/components/input";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
} from "@deadlock-mods/ui/icons";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ImportOutcome,
  type ImportStageProgress,
  type InterchangeSource,
  type UnrecognizedMod,
  isRemoteIdInLibrary,
  useIdentifyMods,
  useInterchangeLedger,
  useLinkMod,
  useReadInterchangeSource,
  useRunInterchangeImport,
} from "@/hooks/use-mod-interchange";
import { getErrorMessage } from "@/lib/errors";
import {
  type IdentifyResult,
  type InterchangeDocument,
  type InterchangeMod,
  libraryIdForEntry,
  parseGameBananaReference,
} from "@/lib/mod-interchange";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";

type Step = "loading" | "contents" | "importing" | "unrecognized" | "done";

interface ImportWizardDialogProps {
  source: InterchangeSource | null;
  onOpenChange: (open: boolean) => void;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const entrySize = (entry: InterchangeMod) =>
  entry.files.reduce((sum, file) => sum + (file.size ?? 0), 0);

const toggleIn = (set: Set<string>, key: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

const sourceName = (
  source: InterchangeSource | null,
  document: InterchangeDocument | null,
) =>
  source?.kind === "manager" ? source.name : (document?.source.manager ?? "");

export const ImportWizardDialog = ({
  source,
  onOpenChange,
}: ImportWizardDialogProps) => {
  const { t } = useTranslation();
  const open = source !== null;
  const read = useReadInterchangeSource();
  const runImport = useRunInterchangeImport();
  const identify = useIdentifyMods();
  const link = useLinkMod();
  const ledger = useInterchangeLedger(open);

  const libraryMods = usePersistedStore(
    (state) => state.getActiveProfile()?.mods ?? state.localMods,
  );
  const libraryIds = useMemo(
    () => new Set(libraryMods.map((mod) => mod.remoteId)),
    [libraryMods],
  );

  const [step, setStep] = useState<Step>("loading");
  const [document, setDocument] = useState<InterchangeDocument | null>(null);
  const [modKeys, setModKeys] = useState<Set<string>>(new Set());
  const [profileKeys, setProfileKeys] = useState<Set<string>>(new Set());
  const [crosshairKeys, setCrosshairKeys] = useState<Set<string>>(new Set());
  const [showMods, setShowMods] = useState(false);
  const [progress, setProgress] = useState<ImportStageProgress | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, setPending] = useState<UnrecognizedMod[]>([]);
  const [suggestions, setSuggestions] = useState<
    Record<string, IdentifyResult>
  >({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [linked, setLinked] = useState<Record<string, string>>({});
  // DMM refuses to enable mods while Deadlock runs; the import then parks
  // them disabled. Say so before the user starts.
  const [gameRunning, setGameRunning] = useState(false);
  // Reading hashes every VPK once (cached afterwards): show real progress.
  const [readProgress, setReadProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!source) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void listen<{ current: number; total: number; name: string }>(
      "interchange-read-progress",
      (event) => setReadProgress(event.payload),
    ).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [source]);

  const inLibrary = (entry: InterchangeMod) => {
    const id = libraryIdForEntry(entry, ledger.data ?? {});
    return !!id && libraryIds.has(id);
  };

  // Read the source as soon as the wizard opens.
  useEffect(() => {
    if (!source) return;
    setStep("loading");
    setReadProgress(null);
    setDocument(null);
    setOutcome(null);
    setProgress(null);
    setSuggestions({});
    setManual({});
    setLinked({});
    isGameRunning()
      .then(setGameRunning)
      .catch(() => setGameRunning(false));
    read.mutate(source, {
      onSuccess: (loaded) => {
        setDocument(loaded);
        setStep("contents");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Default selection: everything that is new.
  useEffect(() => {
    if (!document) return;
    setModKeys(
      new Set(document.mods.filter((mod) => !inLibrary(mod)).map((m) => m.key)),
    );
    setProfileKeys(new Set());
    setCrosshairKeys(new Set(document.crosshairs.map((c) => c.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, ledger.data]);

  const busy =
    read.isPending ||
    runImport.isPending ||
    link.isPending ||
    identify.isPending;
  const name = sourceName(source, document);

  const start = () => {
    if (!document) return;
    setStep("importing");
    runImport.mutate(
      {
        document,
        selection: {
          modKeys: [...modKeys],
          profileKeys: [...profileKeys],
          crosshairKeys: [...crosshairKeys],
        },
        onProgress: setProgress,
      },
      {
        onSuccess: (result) => {
          setOutcome(result);
          setPending(result.unrecognized);
          setStep(result.unrecognized.length > 0 ? "unrecognized" : "done");
          ledger.refetch();
        },
        onError: (error) => {
          toast.error(
            t("interchange.importFailed", { error: getErrorMessage(error) }),
          );
          setStep("contents");
        },
      },
    );
  };

  const analyze = () =>
    identify.mutate(
      pending.filter((mod) => !linked[mod.modId]).map((mod) => mod.modId),
      {
        onSuccess: (results) => {
          setSuggestions((current) => ({
            ...current,
            ...Object.fromEntries(results.map((r) => [r.modId, r])),
          }));
          const found = results.filter((r) => r.remoteId).length;
          toast.info(t("interchange.analyzeResult", { count: found }));
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  const linkMod = (mod: UnrecognizedMod, target: string | null) => {
    if (!target) {
      toast.error(t("interchange.invalidReference"));
      return;
    }
    if (isRemoteIdInLibrary(target)) {
      toast.error(t("interchange.alreadyInLibrary"));
      return;
    }
    link.mutate(
      { from: mod.modId, to: target },
      {
        onSuccess: ({ name: linkedName }) => {
          setLinked((current) => ({ ...current, [mod.modId]: linkedName }));
          toast.success(t("interchange.linked", { name: linkedName }));
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );
  };

  const modsSelectable = document?.mods.filter((mod) => !inLibrary(mod)) ?? [];
  const nothingSelected =
    modKeys.size === 0 && profileKeys.size === 0 && crosshairKeys.size === 0;
  const percent = progress
    ? Math.round(
        ((progress.stageIndex +
          (progress.total > 0 ? progress.current / progress.total : 0)) /
          Math.max(1, progress.stageCount)) *
          100,
      )
    : 0;

  const sectionRow = (
    id: string,
    checked: boolean | "indeterminate",
    onChange: (on: boolean) => void,
    title: string,
    detail: string,
    disabled = false,
  ) => (
    <label
      className='flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
      htmlFor={id}>
      <Checkbox
        checked={checked}
        data-testid={id}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <div className='min-w-0 flex-1'>
        <p className='font-medium text-sm'>{title}</p>
        <p className='text-muted-foreground text-xs'>{detail}</p>
      </div>
    </label>
  );

  return (
    <Dialog onOpenChange={busy ? undefined : onOpenChange} open={open}>
      <DialogContent
        className='flex max-h-[85vh] max-w-3xl flex-col'
        data-step={step}
        data-testid='interchange-wizard'>
        <DialogHeader>
          <DialogTitle>
            {t("interchange.importTitle", { source: name })}
          </DialogTitle>
          <DialogDescription>
            {t(`interchange.stepDescription.${step}`, { source: name })}
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className='flex items-center gap-2 py-6 text-muted-foreground text-sm'>
            {read.isError ? (
              <>
                <AlertTriangle className='h-4 w-4 text-destructive' />
                <span className='whitespace-pre-line'>
                  {getErrorMessage(read.error)}
                </span>
              </>
            ) : (
              <div
                className='w-full space-y-3'
                data-testid='interchange-read-progress'>
                <div className='flex items-center gap-2'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  {readProgress && readProgress.total > 0
                    ? t("interchange.checkingFiles", {
                        current: readProgress.current,
                        total: readProgress.total,
                      })
                    : t("interchange.scanning", { source: name })}
                </div>
                {readProgress && readProgress.total > 0 && (
                  <>
                    <Progress
                      value={Math.round(
                        (readProgress.current / readProgress.total) * 100,
                      )}
                    />
                    <p className='truncate text-xs'>{readProgress.name}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === "contents" && document && (
          <ScrollArea className='min-h-0 flex-1 pr-3'>
            <div className='space-y-3'>
              {gameRunning && (
                <div
                  className='flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
                  data-testid='interchange-game-running'>
                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                  <span>{t("interchange.gameRunning")}</span>
                </div>
              )}
              {document.mods.length === 0 && (
                <p className='rounded-lg border bg-muted/30 p-3 text-sm'>
                  {t("interchange.emptySource", { source: name })}
                </p>
              )}

              {sectionRow(
                "interchange-section-mods",
                modKeys.size === 0
                  ? false
                  : modKeys.size === modsSelectable.length
                    ? true
                    : "indeterminate",
                (on) =>
                  setModKeys(
                    on ? new Set(modsSelectable.map((m) => m.key)) : new Set(),
                  ),
                t("interchange.sectionMods"),
                t("interchange.sectionModsDetail", {
                  count: modsSelectable.length,
                  total: document.mods.length,
                }),
                modsSelectable.length === 0,
              )}
              <button
                className='flex items-center gap-1 pl-3 text-muted-foreground text-xs hover:text-foreground'
                data-testid='interchange-choose-mods'
                onClick={() => setShowMods((v) => !v)}
                type='button'>
                {showMods ? (
                  <ChevronDown className='h-3 w-3' />
                ) : (
                  <ChevronRight className='h-3 w-3' />
                )}
                {t("interchange.chooseMods")}
              </button>
              {showMods && (
                <ul className='divide-y rounded-lg border'>
                  {document.mods.map((mod) => {
                    const known = inLibrary(mod);
                    return (
                      <li
                        className='flex items-center gap-3 px-3 py-2'
                        data-in-library={known}
                        data-key={mod.key}
                        data-testid='interchange-mod-row'
                        key={mod.key}>
                        <Checkbox
                          aria-label={mod.name}
                          checked={modKeys.has(mod.key)}
                          disabled={known}
                          onCheckedChange={(v) =>
                            setModKeys((s) => toggleIn(s, mod.key, v === true))
                          }
                        />
                        <div className='min-w-0 flex-1'>
                          <p className='truncate font-medium text-sm'>
                            {mod.name}
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            {t("interchange.fileCount", {
                              count: mod.files.length,
                            })}{" "}
                            · {formatSize(entrySize(mod))}
                            {mod.category ? ` · ${mod.category}` : ""}
                          </p>
                        </div>
                        <div className='flex shrink-0 gap-1'>
                          {known && (
                            <Badge variant='secondary'>
                              {t("interchange.inLibrary")}
                            </Badge>
                          )}
                          <Badge variant='outline'>
                            {mod.origin.provider === "gamebanana"
                              ? "GameBanana"
                              : t("interchange.local")}
                          </Badge>
                          <Badge
                            variant={mod.enabled ? "default" : "secondary"}>
                            {mod.enabled
                              ? t("interchange.enabled")
                              : t("interchange.disabled")}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {document.profiles.length > 0 ? (
                <div className='space-y-2'>
                  {sectionRow(
                    "interchange-section-profiles",
                    profileKeys.size === 0
                      ? false
                      : profileKeys.size === document.profiles.length
                        ? true
                        : "indeterminate",
                    (on) =>
                      setProfileKeys(
                        on
                          ? new Set(document.profiles.map((p) => p.key))
                          : new Set(),
                      ),
                    t("interchange.sectionProfiles"),
                    t("interchange.sectionProfilesDetail", {
                      count: document.profiles.length,
                    }),
                  )}
                  <ul className='space-y-1 pl-8'>
                    {document.profiles.map((profile) => (
                      <li
                        className='flex items-center gap-2 text-sm'
                        data-key={profile.key}
                        data-testid='interchange-profile-row'
                        key={profile.key}>
                        <Checkbox
                          aria-label={profile.name}
                          checked={profileKeys.has(profile.key)}
                          onCheckedChange={(v) =>
                            setProfileKeys((s) =>
                              toggleIn(s, profile.key, v === true),
                            )
                          }
                        />
                        <span className='truncate'>{profile.name}</span>
                        <span className='text-muted-foreground text-xs'>
                          {t("interchange.profileMods", {
                            count: profile.mods.length,
                          })}
                        </span>
                        {profile.active && (
                          <Badge variant='outline'>
                            {t("interchange.active")}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                sectionRow(
                  "interchange-section-profiles",
                  false,
                  () => {},
                  t("interchange.sectionProfiles"),
                  t("interchange.noProfiles", { source: name }),
                  true,
                )
              )}

              {sectionRow(
                "interchange-section-crosshairs",
                crosshairKeys.size > 0,
                (on) =>
                  setCrosshairKeys(
                    on
                      ? new Set(document.crosshairs.map((c) => c.key))
                      : new Set(),
                  ),
                t("interchange.sectionCrosshairs"),
                document.crosshairs.length > 0
                  ? t("interchange.sectionCrosshairsDetail", {
                      count: document.crosshairs.length,
                    })
                  : t("interchange.noCrosshairs", { source: name }),
                document.crosshairs.length === 0,
              )}

              {document.warnings.length > 0 && (
                <details className='rounded-lg border bg-muted/30 p-3 text-sm'>
                  <summary className='cursor-pointer'>
                    {t("interchange.warnings", {
                      count: document.warnings.length,
                    })}
                  </summary>
                  <ul className='mt-2 list-disc space-y-1 pl-5 text-muted-foreground'>
                    {document.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </ScrollArea>
        )}

        {step === "importing" && (
          <div className='space-y-3 py-4' data-testid='interchange-progress'>
            <Progress value={percent} />
            <p className='text-muted-foreground text-sm'>
              {progress
                ? t(`interchange.progress.${progress.stage}`, {
                    name: progress.label,
                    current: Math.min(progress.current + 1, progress.total),
                    total: progress.total,
                  })
                : t("interchange.progress.starting")}
              {progress?.itemName ? ` · ${progress.itemName}` : ""}
            </p>
          </div>
        )}

        {step === "unrecognized" && (
          <ScrollArea className='min-h-0 flex-1 pr-3'>
            <div className='space-y-3'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-muted-foreground text-sm'>
                  {t("interchange.unrecognizedHint", { count: pending.length })}
                </p>
                <Button
                  data-testid='interchange-analyze'
                  disabled={busy}
                  icon={<Search className='h-4 w-4' />}
                  isLoading={identify.isPending}
                  onClick={analyze}
                  size='sm'
                  variant='outline'>
                  {t("interchange.analyze")}
                </Button>
              </div>
              <ul className='divide-y rounded-lg border'>
                {pending.map((mod) => {
                  const suggestion = suggestions[mod.modId];
                  const done = linked[mod.modId];
                  return (
                    <li
                      className='space-y-2 px-3 py-2'
                      data-linked={!!done}
                      data-mod-id={mod.modId}
                      data-testid='interchange-unrecognized-row'
                      key={mod.modId}>
                      <div className='flex items-center justify-between gap-2'>
                        <p className='truncate font-medium text-sm'>
                          {mod.name}
                        </p>
                        {done && (
                          <Badge>
                            {t("interchange.linkedBadge", { name: done })}
                          </Badge>
                        )}
                      </div>
                      {!done && suggestion?.remoteId && (
                        <div className='flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm'>
                          <span>
                            {t("interchange.suggestion", {
                              name: suggestion.modName ?? suggestion.remoteId,
                              certainty: suggestion.certainty ?? 0,
                            })}
                          </span>
                          <Button
                            disabled={busy}
                            onClick={() => linkMod(mod, suggestion.remoteId)}
                            size='sm'>
                            {t("interchange.useSuggestion")}
                          </Button>
                        </div>
                      )}
                      {!done && suggestion && !suggestion.remoteId && (
                        <p className='text-muted-foreground text-xs'>
                          {suggestion.error ?? t("interchange.noMatch")}
                        </p>
                      )}
                      {!done && (
                        <div className='flex gap-2'>
                          <Input
                            className='h-8'
                            data-testid='interchange-link-input'
                            onChange={(e) =>
                              setManual((m) => ({
                                ...m,
                                [mod.modId]: e.target.value,
                              }))
                            }
                            placeholder={t("interchange.linkPlaceholder")}
                            value={manual[mod.modId] ?? ""}
                          />
                          <Button
                            data-testid='interchange-link-button'
                            disabled={busy || !manual[mod.modId]?.trim()}
                            onClick={() =>
                              linkMod(
                                mod,
                                parseGameBananaReference(
                                  manual[mod.modId] ?? "",
                                ),
                              )
                            }
                            size='sm'
                            variant='outline'>
                            {t("interchange.link")}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </ScrollArea>
        )}

        {step === "done" && outcome && (
          <div
            className='space-y-3'
            data-crosshairs={outcome.crosshairs}
            data-failed={outcome.failed}
            data-imported={outcome.imported}
            data-profiles={outcome.profiles.filter((p) => p.profileId).length}
            data-skipped={outcome.skipped}
            data-testid='interchange-summary'>
            <div className='flex items-center gap-2 font-medium'>
              <CheckCircle className='h-5 w-5 text-green-600' />
              {t("interchange.summary", {
                imported: outcome.imported,
                skipped: outcome.skipped,
                failed: outcome.failed,
              })}
            </div>
            <ul className='space-y-1 text-muted-foreground text-sm'>
              {outcome.profiles.map((profile) => (
                <li key={profile.name}>
                  {profile.error
                    ? t("interchange.profileFailed", {
                        name: profile.name,
                        error: profile.error,
                      })
                    : t("interchange.profileCreated", { name: profile.name })}
                </li>
              ))}
              {outcome.crosshairs > 0 && (
                <li>
                  {t("interchange.crosshairsAdded", {
                    count: outcome.crosshairs,
                  })}
                </li>
              )}
              {Object.keys(linked).length > 0 && (
                <li>
                  {t("interchange.linkedCount", {
                    count: Object.keys(linked).length,
                  })}
                </li>
              )}
            </ul>
            <ScrollArea className='max-h-48'>
              <ul className='space-y-1 text-sm'>
                {[
                  ...(outcome.library?.results ?? []),
                  ...outcome.profiles.flatMap((p) => p.report?.results ?? []),
                ]
                  .filter((result) => result.reason)
                  .map((result, index) => (
                    <li key={`${result.key}-${index}`}>
                      <span className='font-medium'>
                        {document?.mods.find((m) => m.key === result.key)
                          ?.name ?? result.key}
                      </span>
                      <span className='text-muted-foreground'>
                        {" "}
                        · {result.reason}
                      </span>
                    </li>
                  ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className='gap-2'>
          {step === "contents" && (
            <Button
              data-testid='interchange-next'
              disabled={nothingSelected || busy}
              onClick={start}>
              {t("interchange.startImport")}
            </Button>
          )}
          {step === "unrecognized" && (
            <Button
              data-testid='interchange-finish'
              disabled={busy}
              onClick={() => setStep("done")}>
              {pending.every((mod) => linked[mod.modId])
                ? t("interchange.continue")
                : t("interchange.skipIdentification")}
            </Button>
          )}
          {(step === "done" || (step === "loading" && read.isError)) && (
            <Button
              data-testid='interchange-close'
              onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
