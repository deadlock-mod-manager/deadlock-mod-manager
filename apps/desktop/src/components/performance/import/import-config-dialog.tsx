import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Tabs } from "@deadlock-mods/ui/components/tabs";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { useApplyPerfConfig } from "@/hooks/performance/use-perf-mutations";
import {
  usePerfCatalog,
  usePerfResolve,
} from "@/hooks/performance/use-perf-queries";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { discardPerfStaging } from "@/lib/performance/api";
import {
  formatBuildDate,
  groupReviewEntries,
} from "@/lib/performance/import/review";
import {
  buildUserPerfConfig,
  type ImportModContext,
  importOrigin,
  importOverrides,
  type PerfImportNavigationState,
} from "@/lib/performance/import/save";
import {
  newUserConfigId,
  presetApplyRequest,
  presetConfigId,
  userConfigApplyRequest,
} from "@/lib/performance/request";
import { usePersistedStore } from "@/lib/store";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ImportReport } from "@/types/generated/ImportReport";
import type { ImportSource } from "@/types/generated/ImportSource";
import type { PerfApplyRequest } from "@/types/generated/PerfApplyRequest";
import { usePerformanceUi } from "../performance-context";
import { useAppliedConfigName } from "./current-gameinfo-source";
import { ImportReview } from "./import-review";
import {
  ImportSourcePanel,
  ImportSourceTabList,
  initialTab,
  isHandedOver,
  isSourceTab,
  type SourceTab,
} from "./import-source-panel";
import { useImportAnalysis } from "./use-import-analysis";

/** Staging folders created while the dialog is open, and the one a save keeps. */
type ImportSession = {
  stagingIds: Set<string>;
  keptStagingId: string | null;
};

type ImportRoot = {
  source: ImportSource;
  context: ImportModContext | null;
};

const PREVIEW_CONFIG_ID = "user:import-preview";

const emptySession = (): ImportSession => ({
  stagingIds: new Set(),
  keptStagingId: null,
});

const defaultConfigName = (
  report: ImportReport,
  root: ImportRoot,
  t: TFunction,
  locale: string,
) => {
  if (root.context) {
    const variant = report.variants.find(
      (candidate) => candidate.path === report.selectedVariant,
    );
    return report.variants.length > 1 && variant
      ? `${root.context.modName} (${variant.label})`
      : root.context.modName;
  }
  if (report.suggestedName) return report.suggestedName;
  return t(`performance.import.defaultNames.${root.source.kind}`, {
    date: new Date().toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    }),
  });
};

/** What the review shows once the user changes a default; never applied. */
const previewRequest = (
  report: ImportReport,
  overrides: EntryOverride[],
  includeEngineSections: boolean,
  presetName: string | null,
): PerfApplyRequest =>
  report.presetId
    ? presetApplyRequest(
        { id: report.presetId, name: presetName ?? report.presetId },
        { overrides, includeEngineSections },
      )
    : userConfigApplyRequest(
        { id: PREVIEW_CONFIG_ID, name: "", entries: report.entries },
        { overrides, includeEngineSections },
      );

const FormatLine = ({
  report,
  presetName,
}: {
  report: ImportReport;
  presetName: string | null;
}) => {
  const { t, i18n } = useTranslation();
  const format = t(`performance.import.formats.${report.format}`);
  const line = report.base
    ? t(
        report.base.exact
          ? "performance.import.base.exact"
          : "performance.import.base.closest",
        {
          format,
          build: report.base.build,
          date: formatBuildDate(report.base.date, i18n.language),
        },
      )
    : format;
  return (
    <div className='flex flex-col gap-1'>
      <p className='flex items-center gap-2 text-sm'>
        <CheckCircleIcon
          className='size-4 shrink-0 text-emerald-500'
          weight='bold'
        />
        {line}
      </p>
      {presetName && (
        <p className='pl-6 text-muted-foreground text-xs'>
          {report.overrides.length > 0
            ? t("performance.import.preset.description", {
                preset: presetName,
                count: report.overrides.length,
              })
            : t("performance.import.preset.descriptionNoTweaks", {
                preset: presetName,
              })}
        </p>
      )}
    </div>
  );
};

const AnalysisError = ({
  source,
  error,
}: {
  source: ImportSource;
  error: Error;
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4'>
      <p className='flex items-center gap-2 font-medium text-sm'>
        <WarningCircleIcon
          className='size-4 shrink-0 text-destructive'
          weight='bold'
        />
        {t(`performance.import.errors.${source.kind}.title`)}
      </p>
      <p className='text-muted-foreground text-sm'>
        {t(`performance.import.errors.${source.kind}.description`)}
      </p>
      <p className='break-words font-mono text-muted-foreground text-xs'>
        {getErrorMessage(error)}
      </p>
    </div>
  );
};

const NoHandEdits = ({ report }: { report: ImportReport }) => {
  const { t, i18n } = useTranslation();
  const appliedName = useAppliedConfigName();
  const stock = report.base
    ? t("performance.import.current.noEdits.stockBuild", {
        build: report.base.build,
        date: formatBuildDate(report.base.date, i18n.language),
      })
    : t("performance.import.current.noEdits.stock");
  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 px-8 text-center'>
      <span className='flex size-12 items-center justify-center rounded-full bg-emerald-500/10'>
        <CheckCircleIcon className='size-6 text-emerald-500' weight='bold' />
      </span>
      <p className='font-medium'>
        {t("performance.import.current.noEdits.title")}
      </p>
      <p className='max-w-md text-muted-foreground text-sm leading-relaxed'>
        {appliedName
          ? t("performance.import.current.noEdits.withApplied", {
              name: appliedName,
              stock,
            })
          : t("performance.import.current.noEdits.withoutApplied", { stock })}
      </p>
    </div>
  );
};

type ImportDialogBodyProps = {
  initialSource: ImportSource | null;
  context: ImportModContext | null;
  session: RefObject<ImportSession>;
  onClose: () => void;
};

const ImportDialogBody = ({
  initialSource,
  context,
  session,
  onClose,
}: ImportDialogBodyProps) => {
  const { t, i18n } = useTranslation();
  const analysis = useImportAnalysis((stagingId) => {
    session.current.stagingIds.add(stagingId);
  });
  const applyConfig = useApplyPerfConfig();
  const { data: catalog } = usePerfCatalog();
  const addUserPerfConfig = usePersistedStore(
    (state) => state.addUserPerfConfig,
  );
  const setPerfOverrides = usePersistedStore((state) => state.setPerfOverrides);
  const setPerfIncludeEngineSections = usePersistedStore(
    (state) => state.setPerfIncludeEngineSections,
  );
  const perfOverrides = usePersistedStore((state) => state.perfOverrides);

  const [root, setRoot] = useState<ImportRoot | null>(
    initialSource ? { source: initialSource, context } : null,
  );
  const [sourceTab, setSourceTab] = useState<SourceTab>(
    initialTab(initialSource),
  );
  const [tabsVisible, setTabsVisible] = useState(
    !initialSource || !isHandedOver(initialSource),
  );
  const [cameraIncluded, setCameraIncluded] = useState(true);
  const [includeEngineSections, setIncludeEngineSections] = useState(false);
  const [name, setName] = useState("");
  const nameEdited = useRef(false);
  // Kept through a failed re-analysis so the variant picker stays usable.
  const [lastReport, setLastReport] = useState<ImportReport | null>(null);

  const { mutate: analyze, reset: resetAnalysis } = analysis;
  const run = useCallback(
    (source: ImportSource, nextRoot: ImportRoot) => {
      if (source.kind === "staged") {
        session.current.stagingIds.add(source.staging_id);
      }
      analyze(
        { source, root: nextRoot.source, context: nextRoot.context },
        {
          onSuccess: (result) => {
            setLastReport(result);
            if (result.format === "shareCode") {
              setIncludeEngineSections(result.includeEngineSections);
            }
            if (!nameEdited.current) {
              setName(defaultConfigName(result, nextRoot, t, i18n.language));
            }
          },
        },
      );
    },
    [analyze, session, t, i18n.language],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialSource) return;
    started.current = true;
    run(initialSource, { source: initialSource, context });
  }, [initialSource, context, run]);

  const clearReview = () => {
    setLastReport(null);
    setCameraIncluded(true);
    setIncludeEngineSections(false);
    setName("");
    nameEdited.current = false;
  };

  const startFrom = (source: ImportSource) => {
    const nextRoot = { source, context: null };
    clearReview();
    setRoot(nextRoot);
    run(source, nextRoot);
  };

  const changeSource = () => {
    clearReview();
    setRoot(null);
    resetAnalysis();
  };

  const report = analysis.data ?? null;
  const readsLiveFile = root?.source.kind === "currentGameinfo";

  const pickVariant = (variantPath: string) => {
    if (!root) return;
    const stagingId =
      lastReport?.stagingId ??
      (root.source.kind === "staged" ? root.source.staging_id : null);
    if (!stagingId) return;
    run(
      { kind: "staged", staging_id: stagingId, variant_path: variantPath },
      root,
    );
  };

  const presetName = report?.presetId
    ? (catalog?.presets.find((preset) => preset.id === report.presetId)?.name ??
      report.suggestedName ??
      report.presetId)
    : null;

  const cameraPaths = useMemo(
    () =>
      report
        ? groupReviewEntries(report.resolved.entries).cameraVisibility.map(
            (entry) => entry.path,
          )
        : [],
    [report],
  );
  const overrides = useMemo(
    () => importOverrides(report?.overrides ?? [], cameraPaths, cameraIncluded),
    [report, cameraPaths, cameraIncluded],
  );

  const choicesChanged =
    report !== null &&
    (!cameraIncluded || includeEngineSections !== report.includeEngineSections);
  const preview = usePerfResolve(
    report && choicesChanged
      ? previewRequest(report, overrides, includeEngineSections, presetName)
      : null,
  );
  const resolved =
    report && choicesChanged && preview.data ? preview.data : report?.resolved;

  const configName = name.trim();
  const canSave =
    report !== null &&
    root !== null &&
    !analysis.isPending &&
    (report.presetId !== null ||
      (report.entries.length > 0 && configName.length > 0));

  const saveUserConfig = (apply: boolean) => {
    if (!report || !root) return;
    const config = buildUserPerfConfig({
      id: newUserConfigId(),
      name: configName,
      createdAt: new Date().toISOString(),
      origin: importOrigin(root.source, report, root.context),
      report,
    });
    addUserPerfConfig(config);
    if (overrides.length > 0) setPerfOverrides(config.id, overrides);
    if (includeEngineSections) setPerfIncludeEngineSections(config.id, true);
    session.current.keptStagingId = report.stagingId;

    if (apply) {
      applyConfig.mutate({
        request: userConfigApplyRequest(config, {
          overrides,
          includeEngineSections,
        }),
        source: root.source.kind === "gameBanana" ? "community" : "imported",
        entryPoint: "import",
      });
    } else {
      toast.success(
        t("performance.import.toasts.saved", { name: config.name }),
      );
    }
    onClose();
  };

  const savePresetTweaks = (apply: boolean) => {
    if (!report?.presetId || !presetName) return;
    const configId = presetConfigId(report.presetId);
    setPerfOverrides(configId, overrides);
    setPerfIncludeEngineSections(configId, includeEngineSections);
    if (apply) {
      applyConfig.mutate({
        request: presetApplyRequest(
          { id: report.presetId, name: presetName },
          { overrides, includeEngineSections },
        ),
        source: "imported",
        entryPoint: "import",
      });
    } else {
      toast.success(
        t("performance.import.toasts.presetTweaksSaved", { name: presetName }),
      );
    }
    onClose();
  };

  const replacedTweaks = report?.presetId
    ? (perfOverrides[presetConfigId(report.presetId)]?.length ?? 0)
    : 0;

  return (
    <>
      <DialogHeader className='border-b px-6 pt-5 pb-4'>
        <DialogTitle>{t("performance.import.title")}</DialogTitle>
        <DialogDescription>
          {t("performance.import.description")}
        </DialogDescription>
      </DialogHeader>

      <Tabs
        className='flex min-h-0 flex-1 flex-col'
        onValueChange={(value) => {
          if (!isSourceTab(value)) return;
          setSourceTab(value);
          changeSource();
        }}
        value={sourceTab}>
        {tabsVisible && <ImportSourceTabList />}
        <div className='grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:overflow-hidden'>
          <section className='flex min-h-0 flex-col border-b p-5 md:overflow-y-auto md:border-r md:border-b-0'>
            <ImportSourcePanel
              context={context}
              initialSource={initialSource}
              isAnalyzing={analysis.isPending}
              onAnalyze={startFrom}
              onPickVariant={pickVariant}
              onShowTabs={() => {
                setTabsVisible(true);
                changeSource();
              }}
              report={report ?? lastReport}
              tabsVisible={tabsVisible}
            />
          </section>

          <section className='min-h-0 p-5 md:overflow-y-auto'>
            {analysis.isPending && (
              <p className='flex items-center gap-2 text-muted-foreground text-sm'>
                <CircleNotchIcon className='size-4 animate-spin' />
                {t("performance.import.review.analyzing")}
              </p>
            )}
            {analysis.isError && root && (
              <AnalysisError error={analysis.error} source={root.source} />
            )}
            {analysis.isIdle && (
              <p className='text-muted-foreground text-sm'>
                {t("performance.import.review.empty")}
              </p>
            )}
            {report &&
            resolved &&
            readsLiveFile &&
            report.entries.length === 0 ? (
              <NoHandEdits report={report} />
            ) : (
              report &&
              resolved && (
                <div className='flex flex-col gap-3'>
                  <FormatLine presetName={presetName} report={report} />
                  {readsLiveFile && (
                    <p className='text-sm'>
                      {t("performance.import.current.found", {
                        count: report.entries.length,
                      })}
                    </p>
                  )}
                  {report.entries.length === 0 && !report.presetId && (
                    <p className='rounded-md border bg-card/40 px-3 py-2 text-muted-foreground text-sm'>
                      {t("performance.import.review.nothingToImport")}
                    </p>
                  )}
                  <ImportReview
                    cameraIncluded={cameraIncluded}
                    includeEngineSections={includeEngineSections}
                    onCameraIncludedChange={setCameraIncluded}
                    onIncludeEngineSectionsChange={setIncludeEngineSections}
                    report={report}
                    resolved={resolved}
                  />
                </div>
              )
            )}
          </section>
        </div>
      </Tabs>

      <footer className='flex flex-wrap items-center gap-3 border-t px-6 py-3'>
        {presetName ? (
          <p className='min-w-0 flex-1 text-muted-foreground text-xs'>
            {replacedTweaks > 0 &&
              t("performance.import.preset.replacesTweaks", {
                count: replacedTweaks,
                preset: presetName,
              })}
          </p>
        ) : (
          <div className='flex min-w-0 flex-1 items-center gap-3'>
            <Label
              className='shrink-0 text-muted-foreground'
              htmlFor='perf-import-name'>
              {t("performance.import.footer.saveAs")}
            </Label>
            <Input
              className='max-w-xs'
              disabled={!report}
              id='perf-import-name'
              onChange={(event) => {
                nameEdited.current = true;
                setName(event.target.value);
              }}
              value={name}
            />
          </div>
        )}
        <Button onClick={onClose} variant='ghost'>
          {t("common.cancel")}
        </Button>
        {presetName ? (
          <>
            {overrides.length > 0 && (
              <Button
                disabled={!canSave}
                onClick={() => savePresetTweaks(false)}
                variant='outline'>
                {t("performance.import.footer.saveTweaks")}
              </Button>
            )}
            <Button
              disabled={!canSave}
              icon={<CheckIcon weight='bold' />}
              onClick={() => savePresetTweaks(true)}>
              {overrides.length > 0
                ? t("performance.import.footer.usePreset", {
                    preset: presetName,
                    count: overrides.length,
                  })
                : t("performance.import.footer.usePresetNoTweaks", {
                    preset: presetName,
                  })}
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={!canSave}
              onClick={() => saveUserConfig(false)}
              variant='outline'>
              {t("performance.import.footer.save")}
            </Button>
            <Button
              disabled={!canSave}
              icon={<CheckIcon weight='bold' />}
              onClick={() => saveUserConfig(true)}>
              {t("performance.import.footer.saveAndApply")}
            </Button>
          </>
        )}
      </footer>
    </>
  );
};

/**
 * Import dialog for the Performance page. Opens from the page header, from
 * GameBanana config cards, and from the "this mod includes a performance
 * config" prompt, which hands its staged archive over through router state.
 */
export const ImportConfigDialog = () => {
  const { importOpen, importSource, openImport, closeImport } =
    usePerformanceUi();
  const location = useLocation();
  const navigate = useNavigate();
  const [modContext, setModContext] = useState<ImportModContext | null>(null);
  const session = useRef<ImportSession>(emptySession());

  const navigationState: PerfImportNavigationState | null = location.state;
  useEffect(() => {
    if (!navigationState?.importSource) return;
    setModContext(navigationState.importContext);
    openImport(navigationState.importSource);
    navigate(location.pathname, { replace: true, state: null });
  }, [navigationState, openImport, navigate, location.pathname]);

  const close = () => {
    const { stagingIds, keptStagingId } = session.current;
    for (const stagingId of stagingIds) {
      if (stagingId === keptStagingId) continue;
      discardPerfStaging(stagingId).catch((error) =>
        logger
          .withError(error)
          .warn("Discarding staged performance config failed"),
      );
    }
    session.current = emptySession();
    setModContext(null);
    closeImport();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={importOpen}>
      <DialogContent className='flex h-[min(52rem,calc(100vh-5rem))] flex-col gap-0 p-0 sm:max-w-6xl'>
        <ImportDialogBody
          context={modContext}
          initialSource={importSource}
          key={JSON.stringify(importSource)}
          onClose={close}
          session={session}
        />
      </DialogContent>
    </Dialog>
  );
};
