import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Slider } from "@deadlock-mods/ui/components/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import {
  Code,
  Database,
  LayoutGrid,
  Sparkles,
  TriangleAlert,
} from "@deadlock-mods/ui/icons";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultParams,
  type PresetDef,
  presetById,
} from "@/lib/stats/dashboard/catalog";
import { API_EXAMPLES } from "@/lib/stats/dashboard/api-query";
import { missingFields } from "@/lib/stats/dashboard/dataset";
import {
  createId,
  type DashboardWidget,
  defaultView,
  GRID_COLUMNS,
  type MatchQuery,
  matchQuerySchema,
  MAX_ROWS,
  MIN_ROWS,
  ROW_HEIGHT_PX,
  type WidgetView,
} from "@/lib/stats/dashboard/layout";
import { GROUP_FIELD } from "@/lib/stats/dashboard/match-query";
import {
  adaptView,
  chartForGroup,
  seriesLimit,
  suggestView,
} from "@/lib/stats/dashboard/suggest";
import { WidgetContent } from "./dashboard-widget";
import {
  ApiQueryEditor,
  MatchQueryEditor,
  PanelPicker,
  PresetParamsEditor,
  PresetPicker,
} from "./source-pickers";
import { useWidgetData } from "./use-widget-data";
import { useSourceName } from "./use-widget-title";
import { OptionRow, ViewOptions } from "./view-options";

type SourceMode = "presets" | "matches" | "api" | "panels";
const SOURCE_MODES: readonly SourceMode[] = [
  "presets",
  "matches",
  "api",
  "panels",
];
const MODE_ICONS = {
  presets: Sparkles,
  matches: Database,
  api: Code,
  panels: LayoutGrid,
} as const;

const WIDTH_OPTIONS = [3, 4, 6, 8, 12] as const;
const AUTO_PREVIEW_PX = 320;

const modeOf = (widget: DashboardWidget): SourceMode => {
  switch (widget.source.kind) {
    case "preset":
      return "presets";
    case "matches":
      return "matches";
    case "api":
      return "api";
    case "panel":
      return "panels";
  }
};

/** The view a match query reads best as; its metrics are always the series. */
const viewForQuery = (query: MatchQuery, color = 0): WidgetView => {
  const chart = chartForGroup(query.groupBy);
  return defaultView(chart, {
    x: query.groupBy === "none" ? "" : GROUP_FIELD,
    y: query.metrics.slice(0, seriesLimit(chart)),
    sortBy: query.groupBy === "hero" ? "matches" : "",
    limit: query.groupBy === "hero" ? 15 : null,
    color,
  });
};

const newMatchesWidget = (): DashboardWidget => {
  const query = matchQuerySchema.parse({
    metrics: ["winrate", "matches"],
    groupBy: "hero",
  });
  return {
    id: createId("widget"),
    title: "",
    w: 6,
    h: 8,
    source: { kind: "matches", query },
    view: { ...viewForQuery(query), y: ["winrate"] },
  };
};

const newApiWidget = (): DashboardWidget => ({
  id: createId("widget"),
  title: "",
  w: 6,
  h: 8,
  source: {
    kind: "api",
    path: API_EXAMPLES[0].path,
    listPath: API_EXAMPLES[0].listPath,
  },
});

const presetWidget = (preset: PresetDef, id: string): DashboardWidget => ({
  id,
  title: "",
  w: preset.size.w,
  h: preset.size.h,
  source: { kind: "preset", preset: preset.id, params: defaultParams(preset) },
  view: preset.view,
});

const Section = ({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) => (
  <section className='flex flex-col gap-3'>
    <h3 className='flex items-center gap-2 font-semibold text-sm'>
      <span className='flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-[11px] text-primary-foreground'>
        {step}
      </span>
      {title}
    </h3>
    {children}
  </section>
);

/** Fits the view to whatever the source now returns, once data is there. */
const useViewAutofit = (
  widget: DashboardWidget | undefined,
  update: (widget: DashboardWidget) => void,
) => {
  const state = useWidgetData(
    widget?.source ?? { kind: "panel", panel: "" },
    undefined,
  );
  const dataset = state.status === "ready" ? state.dataset : null;
  const fieldKeys = dataset?.fields.map((field) => field.key).join("|") ?? "";

  useEffect(() => {
    if (!widget || widget.source.kind === "panel" || !dataset) {
      return;
    }
    if (!widget.view) {
      update({ ...widget, view: suggestView(dataset) });
      return;
    }
    const { view } = widget;
    if (missingFields(dataset, [view.x, ...view.y, view.sortBy]).length > 0) {
      const adapted = adaptView(view, dataset, view.chart);
      update({
        ...widget,
        view: adapted.y.length > 0 ? adapted : suggestView(dataset),
      });
    }
    // Only a change in the available fields should re-fit; reacting to every
    // view edit would undo the user's own choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKeys]);

  return { state, dataset };
};

interface WidgetEditorProps {
  open: boolean;
  /** `null` creates a new widget. */
  initial: DashboardWidget | null;
  onOpenChange: (open: boolean) => void;
  onSave: (widget: DashboardWidget) => void;
}

export const WidgetEditor = ({
  open,
  initial,
  onOpenChange,
  onSave,
}: WidgetEditorProps) => {
  const { t } = useTranslation();
  const sourceName = useSourceName();
  const [mode, setMode] = useState<SourceMode>(
    initial ? modeOf(initial) : "presets",
  );
  // One draft per source type, so peeking at another type and coming back
  // does not throw away what was set up there.
  const [drafts, setDrafts] = useState<
    Partial<Record<SourceMode, DashboardWidget>>
  >(initial ? { [modeOf(initial)]: initial } : {});

  const draft = drafts[mode];
  const update = (widget: DashboardWidget) =>
    setDrafts((current) => ({ ...current, [mode]: widget }));
  const keepId = (fallback: string) => initial?.id ?? draft?.id ?? fallback;

  const { state, dataset } = useViewAutofit(draft, update);

  const switchMode = (next: SourceMode) => {
    setMode(next);
    if (drafts[next]) {
      return;
    }
    if (next === "matches") {
      setDrafts((current) => ({ ...current, matches: newMatchesWidget() }));
    } else if (next === "api") {
      setDrafts((current) => ({ ...current, api: newApiWidget() }));
    }
  };

  const presetSource = draft?.source.kind === "preset" ? draft.source : null;
  const selectedPreset = presetSource
    ? presetById(presetSource.preset)
    : undefined;

  const canSave =
    draft !== undefined &&
    (draft.source.kind === "panel" ||
      (draft.view !== undefined && draft.view.y.length > 0));

  const previewHeight =
    draft?.h === null || draft === undefined
      ? AUTO_PREVIEW_PX
      : draft.h * ROW_HEIGHT_PX - 16;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='flex h-[88vh] max-w-6xl flex-col gap-4'>
        <DialogHeader>
          <DialogTitle>
            {t(
              initial
                ? "stats.dashboard.editor.editTitle"
                : "stats.dashboard.editor.addTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {t("stats.dashboard.editor.description")}
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 flex-1 gap-6 md:grid-cols-[minmax(320px,420px)_1fr]'>
          {/* Block flow, not flex: a height-capped flex column shrinks its
              children instead of scrolling them, and the cards overlap. */}
          <div className='min-h-0 space-y-6 overflow-y-auto pr-2'>
            <Section step={1} title={t("stats.dashboard.editor.stepData")}>
              <div className='grid grid-cols-4 gap-1 rounded-lg bg-muted/60 p-1'>
                {SOURCE_MODES.map((entry) => {
                  const Icon = MODE_ICONS[entry];
                  return (
                    <button
                      aria-pressed={mode === entry}
                      className={
                        mode === entry
                          ? "flex flex-col items-center gap-1 rounded-md bg-background px-1 py-1.5 font-medium text-xs shadow-sm"
                          : "flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-muted-foreground text-xs hover:text-foreground"
                      }
                      key={entry}
                      onClick={() => switchMode(entry)}
                      type='button'>
                      <Icon className='h-4 w-4' />
                      {t(`stats.dashboard.editor.modes.${entry}`)}
                    </button>
                  );
                })}
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(`stats.dashboard.editor.modeHints.${mode}`)}
              </p>

              {mode === "presets" && (
                <>
                  {draft && selectedPreset && presetSource && (
                    <PresetParamsEditor
                      onChange={(params) =>
                        update({
                          ...draft,
                          source: { ...presetSource, params },
                        })
                      }
                      params={presetSource.params}
                      preset={selectedPreset}
                    />
                  )}
                  <PresetPicker
                    onSelect={(preset) =>
                      update(presetWidget(preset, keepId(createId("widget"))))
                    }
                    selectedId={selectedPreset?.id ?? null}
                  />
                </>
              )}
              {mode === "matches" && draft?.source.kind === "matches" && (
                <MatchQueryEditor
                  onChange={(query) => {
                    const regroup =
                      draft.source.kind !== "matches" ||
                      draft.source.query.groupBy !== query.groupBy;
                    const view =
                      regroup || !draft.view
                        ? viewForQuery(query, draft.view?.color)
                        : {
                            ...draft.view,
                            y: query.metrics.slice(
                              0,
                              seriesLimit(draft.view.chart),
                            ),
                          };
                    update({
                      ...draft,
                      source: { kind: "matches", query },
                      view,
                    });
                  }}
                  query={draft.source.query}
                />
              )}
              {mode === "api" && draft?.source.kind === "api" && (
                <ApiQueryEditor
                  listPath={draft.source.listPath}
                  onChange={({ path, listPath }) =>
                    update({
                      ...draft,
                      source: { kind: "api", path, listPath },
                    })
                  }
                  path={draft.source.path}
                />
              )}
              {mode === "panels" && (
                <PanelPicker
                  onSelect={(panel) =>
                    update({
                      id: keepId(createId("widget")),
                      title: "",
                      w: GRID_COLUMNS,
                      h: null,
                      source: { kind: "panel", panel },
                    })
                  }
                  selected={
                    draft?.source.kind === "panel" ? draft.source.panel : null
                  }
                />
              )}
            </Section>

            {draft &&
              draft.source.kind !== "panel" &&
              dataset &&
              draft.view && (
                <Section step={2} title={t("stats.dashboard.editor.stepView")}>
                  <ViewOptions
                    dataset={dataset}
                    onChange={(view) => update({ ...draft, view })}
                    view={draft.view}
                  />
                </Section>
              )}

            {draft && (
              <Section
                step={draft.source.kind === "panel" ? 2 : 3}
                title={t("stats.dashboard.editor.stepLayout")}>
                <OptionRow label={t("stats.dashboard.editor.title")}>
                  <Input
                    className='h-9'
                    maxLength={80}
                    onChange={(event) =>
                      update({ ...draft, title: event.target.value })
                    }
                    placeholder={sourceName(draft.source)}
                    value={draft.title}
                  />
                </OptionRow>
                <OptionRow label={t("stats.dashboard.editor.width")}>
                  <ToggleGroup
                    className='justify-start'
                    onValueChange={(value) =>
                      value && update({ ...draft, w: Number(value) })
                    }
                    size='sm'
                    type='single'
                    value={String(draft.w)}
                    variant='outline'>
                    {WIDTH_OPTIONS.map((width) => (
                      <ToggleGroupItem
                        className='px-3 text-xs'
                        key={width}
                        value={String(width)}>
                        {t(`stats.dashboard.widths.${width}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </OptionRow>
                <OptionRow
                  label={t("stats.dashboard.editor.height", {
                    value:
                      draft.h === null
                        ? t("stats.dashboard.editor.heightAuto")
                        : draft.h,
                  })}>
                  <div className='flex items-center gap-3'>
                    <Slider
                      className='flex-1'
                      max={MAX_ROWS}
                      min={MIN_ROWS}
                      onValueChange={([value]) =>
                        update({ ...draft, h: value ?? MIN_ROWS })
                      }
                      step={1}
                      value={[draft.h ?? 8]}
                    />
                    {draft.source.kind === "panel" && (
                      <Button
                        className='h-8 text-xs'
                        disabled={draft.h === null}
                        onClick={() => update({ ...draft, h: null })}
                        size='sm'
                        variant='outline'>
                        {t("stats.dashboard.editor.heightAuto")}
                      </Button>
                    )}
                  </div>
                </OptionRow>
              </Section>
            )}
          </div>

          <div className='flex min-h-0 flex-col gap-3 overflow-hidden rounded-xl border bg-muted/20 p-4'>
            <div className='flex items-center justify-between'>
              <span className='font-medium text-sm'>
                {t("stats.dashboard.editor.preview")}
              </span>
              {state.status === "ready" && (
                <span className='text-muted-foreground text-xs'>
                  {t("stats.dashboard.editor.datasetInfo", {
                    rows: state.dataset.rows.length,
                    fields: state.dataset.fields.length,
                  })}
                </span>
              )}
            </div>
            <div className='min-h-0 flex-1 overflow-auto'>
              {draft ? (
                <div
                  className='mx-auto w-full'
                  style={{
                    height: previewHeight,
                    maxWidth: `${Math.max(draft.w, 4) * (100 / GRID_COLUMNS)}%`,
                  }}>
                  <WidgetContent widget={draft} />
                </div>
              ) : (
                <p className='py-16 text-center text-muted-foreground text-sm'>
                  {t("stats.dashboard.editor.pickSource")}
                </p>
              )}
            </div>
            {draft &&
              (draft.source.kind === "api" ||
                (selectedPreset && selectedPreset.endpoint)) && (
                <p className='flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'>
                  <TriangleAlert className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
                  {t("stats.dashboard.apiWarning")}
                </p>
              )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='outline'>
            {t("common.cancel")}
          </Button>
          <Button
            data-testid='widget-editor-save'
            disabled={!canSave}
            onClick={() => {
              if (draft) {
                onSave(draft);
              }
            }}>
            {t(
              initial
                ? "stats.dashboard.editor.saveChanges"
                : "stats.dashboard.editor.add",
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
