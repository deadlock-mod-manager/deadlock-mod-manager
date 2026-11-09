import { Button } from "@deadlock-mods/ui/components/button";
import { TabsContent } from "@deadlock-mods/ui/components/tabs";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedModelPreview } from "@/components/foundry/workbench-animated-model-preview";
import {
  modelEditHistory,
  modelEditsEqual,
  resetModelPart,
} from "@/lib/model-edit-history";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingModelEditDocument } from "@/types/generated/ModdingModelEditDocument";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import {
  applyModelMaterialChange,
  commonModelMaterialPart,
} from "@/lib/model-material-bulk-edit";
import {
  applyToonPreset,
  applyReactivePreset,
} from "@/lib/model-material-presets";
import {
  selectModelMaterial,
  type ModelMaterialSelection,
} from "@/lib/model-material-selection";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModelImageProjector } from "@/lib/model-image-projection";
import type { ModelImageSurfaceDraft } from "@/lib/model-image-surface-preview";
import type { ModelSurfacePaintTool } from "@/lib/model-surface-paint";
import { modelEditShortcut } from "@/lib/model-edit-shortcuts";
import { ModelEditorTools, type ModelEditorTool } from "./model-editor-tools";
import { ModelMaterialList } from "./model-material-list";
import { ModelMaterialPatterns } from "./model-material-patterns";
import { ModelMaterialStyleControls } from "./model-material-style-controls";
import { ModelMaterialReactivity } from "./model-material-reactivity";
import { useModelPatterns } from "./use-model-patterns";
import { ModelMaterialControls } from "./model-material-controls";
import { ModelMaterialPaint } from "./model-material-paint";
import { useModelPaint } from "./use-model-paint";
import { ModelAttachedStickers } from "./model-attached-stickers";
import type { ModelPatchRuntime } from "@/lib/model-patch-runtime";

export function ModelMaterialWorkspace({
  addon,
  path,
  document,
  onDirtyChange,
  onSaved,
}: {
  addon: ModdingAddon;
  path: string;
  document: ModdingModelEditDocument;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [history, dispatch] = useReducer(modelEditHistory, {
    edits: document.edits,
    past: [],
    future: [],
  });
  const [selection, setSelection] = useState<ModelMaterialSelection>(() => {
    const first = document.parts[0]?.material ?? "";
    return {
      materials: new Set(first ? [first] : []),
      active: first,
      anchor: first,
    };
  });
  const [tool, setTool] = useState<ModelEditorTool>("material");
  const [materialBrowserExpanded, setMaterialBrowserExpanded] = useState(true);
  const [isolated, setIsolated] = useState(false);
  const [imagePlacementTarget, setImagePlacementTarget] =
    useState<HTMLDivElement | null>(null);
  const [imagePlacementActive, setImagePlacementActive] = useState(false);
  const surfaceTool = useRef<ModelSurfacePaintTool | null>(null);
  const imageProjector = useRef<ModelImageProjector | null>(null);
  const imageDraft = useRef<ModelImageSurfaceDraft | null>(null);
  const attachedPatches = useRef<ModelPatchRuntime | null>(null);
  const [patchManipulating, setPatchManipulating] = useState(false);
  const imageDrop = useRef<
    ((file: File, point: { x: number; y: number }) => void) | null
  >(null);
  const [surfaceEnabled, setSurfaceEnabled] = useState(false);
  const setPlacementActive = useCallback((active: boolean) => {
    setImagePlacementActive(active);
    if (active) setSurfaceEnabled(false);
  }, []);
  const patterns = useModelPatterns(history.edits);
  const paint = useModelPaint(addon.id, history.edits);
  const [materialInputs, setMaterialInputs] = useState<Record<string, number>>({
    $ent_health: 1,
  });
  const inputNames = [
    ...new Set(
      history.edits.flatMap((e) =>
        e.expressions.flatMap(
          (expr) => expr.source.match(/\$[a-zA-Z_][a-zA-Z_0-9]*/g) ?? [],
        ),
      ),
    ),
  ];
  const dirty = !modelEditsEqual(history.edits, document.edits);
  const save = useMutation({
    mutationKey: ["workbench-model-edit", addon.id, path],
    mutationFn: () =>
      invoke("save_modding_model_edits", {
        addonId: addon.id,
        path,
        expectedFingerprint: document.fingerprint,
        edits: history.edits,
      }),
    onSuccess: onSaved,
  });
  useEffect(() => {
    onDirtyChange?.(
      dirty || save.isPending || imagePlacementActive || patchManipulating,
    );
  }, [
    dirty,
    save.isPending,
    imagePlacementActive,
    patchManipulating,
    onDirtyChange,
  ]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const change = (edit: ModdingModelPartEdit) =>
    dispatch({
      type: "change",
      edits: applyModelMaterialChange(
        history.edits,
        document.parts,
        selection.materials,
        edit,
      ),
    });
  const changeSelected = (
    update: (
      part: ModdingModelPart,
      edit: ModdingModelPartEdit,
    ) => ModdingModelPartEdit,
  ) =>
    dispatch({
      type: "change",
      edits: history.edits.map((edit) => {
        const part = document.parts.find(
          (part) => part.material === edit.material,
        );
        return part && selection.materials.has(edit.material)
          ? update(part, edit)
          : edit;
      }),
    });
  const activePart = document.parts.find(
    (part) => part.material === selection.active,
  );
  const selectedParts = document.parts.filter((part) =>
    selection.materials.has(part.material),
  );
  const part = activePart
    ? commonModelMaterialPart(activePart, selectedParts)
    : undefined;
  const edit = history.edits.find((edit) => edit.material === selection.active);
  const multiple = selection.materials.size > 1;
  const allHidden = history.edits.every((candidate) => candidate.hidden);
  return (
    <div
      className='flex h-full min-h-0 flex-col'
      tabIndex={-1}
      onKeyDown={(event) => {
        const editingText =
          event.target instanceof HTMLElement &&
          Boolean(
            event.target.closest('input,textarea,[contenteditable="true"]'),
          );
        const action = modelEditShortcut(event, editingText);
        if (action) {
          event.preventDefault();
          dispatch({ type: action });
        }
      }}>
      <p className='shrink-0 px-1 pb-2 text-[11px] text-muted-foreground'>
        {t("modelEditor.compiledHint")}
      </p>
      <ResizablePanelGroup
        deferResize
        direction='horizontal'
        autoSaveId='workbench-material-editor-v2'
        className='min-h-0 flex-1'>
        <ResizablePanel defaultSize={60} minSize={25}>
          <div className='h-full min-h-0 min-w-0'>
            <AnimatedModelPreview
              attachedPatches={attachedPatches}
              imageDraft={imageDraft}
              pauseForImagePlacement={imagePlacementActive || patchManipulating}
              viewportOverlay={
                <div
                  ref={setImagePlacementTarget}
                  className='pointer-events-none absolute inset-0'
                />
              }
              imageProjector={imageProjector}
              imageDrop={imageDrop}
              surfacePaint={surfaceEnabled ? surfaceTool : undefined}
              model={document.model}
              modelPatterns={patterns.previews}
              modelPaints={paint.previews}
              modelPaintAnimations={paint.animations}
              materialInputs={materialInputs}
              onMaterialPick={(material) => {
                if (imagePlacementActive) return;
                if (document.parts.some((part) => part.material === material))
                  setSelection((current) =>
                    selectModelMaterial(
                      current,
                      material,
                      document.parts.map((part) => part.material),
                    ),
                  );
              }}
              modelEdits={
                isolated && selection.materials.size > 0
                  ? history.edits.map((part) => ({
                      ...part,
                      hidden: !selection.materials.has(part.material),
                    }))
                  : history.edits
              }
              label={path}
              source={{
                filePath: addon.archivePath,
                overlayRoot: addon.gamePath,
                entryPath: path,
                revision: 0,
              }}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={40}
          minSize={30}
          maxSize={70}
          style={{ minWidth: "min(20rem, 70%)" }}>
          <aside
            aria-label={t("modelEditor.materials")}
            className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background'>
            <ModelMaterialList
              expanded={materialBrowserExpanded}
              onExpandedChange={setMaterialBrowserExpanded}
              edits={history.edits}
              selection={selection}
              isolated={isolated}
              disabled={save.isPending || imagePlacementActive}
              onPick={(material, visible, modifiers) =>
                setSelection((current) =>
                  selectModelMaterial(current, material, visible, modifiers),
                )
              }
              onSelectAll={(materials) =>
                setSelection((current) => ({
                  materials: new Set(materials),
                  active: materials.includes(current.active)
                    ? current.active
                    : (materials[0] ?? ""),
                  anchor: materials[0] ?? "",
                }))
              }
              onVisibility={(candidate) =>
                change({ ...candidate, hidden: !candidate.hidden })
              }
              onIsolate={() => setIsolated(!isolated)}
            />
            <ModelEditorTools
              tool={tool}
              material={edit?.material}
              selectedCount={selection.materials.size}
              disabled={imagePlacementActive || patchManipulating}
              resetDisabled={
                save.isPending || imagePlacementActive || patchManipulating
              }
              onReset={() =>
                changeSelected((_part, edit) => resetModelPart(edit.material))
              }
              onToolChange={(value) => {
                setSurfaceEnabled(false);
                setTool(value);
                setMaterialBrowserExpanded(false);
              }}>
              {isolated && selection.materials.size > 0 ? (
                <p
                  role='status'
                  className='border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'>
                  {t("modelEditor.isolateHint")}
                </p>
              ) : null}
              {inputNames.length > 0 ? (
                <div className='space-y-2 border-t p-3 text-xs'>
                  <p className='font-medium'>
                    {t("modelEditor.reactive.simulation")}
                  </p>
                  {inputNames.map((name) => (
                    <label
                      key={name}
                      className='flex items-center justify-between gap-2'>
                      <span className='truncate font-mono'>{name}</span>
                      <Input
                        type='number'
                        aria-label={t("modelEditor.reactive.input", { name })}
                        value={materialInputs[name] ?? 0}
                        step={0.1}
                        className='h-7 w-20 px-2'
                        onChange={(e) => {
                          const value = e.target.valueAsNumber;
                          if (Number.isFinite(value))
                            setMaterialInputs((previous) => ({
                              ...previous,
                              [name]: value,
                            }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {patterns.pending ? (
                <p
                  role='status'
                  className='px-3 text-[11px] text-muted-foreground'>
                  {t("modelEditor.patternLoading")}
                </p>
              ) : null}
              {patterns.error ? (
                <p role='alert' className='p-3 text-xs text-destructive'>
                  {patterns.error.message}
                </p>
              ) : null}
              {paint.error ? (
                <p role='alert' className='p-3 text-xs text-destructive'>
                  {paint.error.message}
                </p>
              ) : null}
              {part && edit ? (
                <>
                  {multiple ? (
                    <p className='border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'>
                      {t("modelEditor.bulkHint", {
                        count: selection.materials.size,
                        material: edit.material
                          .split("/")
                          .at(-1)
                          ?.replace(/\.vmat$/, ""),
                      })}
                    </p>
                  ) : null}
                  <TabsContent
                    value='material'
                    forceMount
                    className='m-0 data-[state=inactive]:hidden'>
                    <ModelMaterialControls
                      part={part}
                      edit={edit}
                      disabled={save.isPending}
                      onChange={change}
                    />
                    <ModelMaterialStyleControls
                      part={part}
                      edit={edit}
                      disabled={save.isPending}
                      onChange={change}
                      onPreset={() => changeSelected(applyToonPreset)}
                    />
                  </TabsContent>
                  <TabsContent
                    value='effects'
                    forceMount
                    className='m-0 data-[state=inactive]:hidden'>
                    <ModelMaterialPatterns
                      edit={edit}
                      disabled={save.isPending || !part.tintable}
                      onChange={change}
                    />
                    <ModelMaterialReactivity
                      part={part}
                      edit={edit}
                      disabled={save.isPending}
                      onChange={change}
                      onPreset={(source) =>
                        changeSelected((part, edit) =>
                          applyReactivePreset(part, edit, source),
                        )
                      }
                    />
                  </TabsContent>
                  <TabsContent
                    value='stickers'
                    forceMount
                    className='m-0 data-[state=inactive]:hidden'>
                    <div className='px-4'>
                      <ModelAttachedStickers
                        active={tool === "stickers"}
                        addonId={addon.id}
                        supported={part.diagnostic !== "shader"}
                        material={edit.material}
                        edits={history.edits}
                        disabled={
                          multiple || save.isPending || imagePlacementActive
                        }
                        runtime={attachedPatches}
                        onActiveChange={setPatchManipulating}
                        onChange={(material, patches) =>
                          dispatch({
                            type: "change",
                            edits: history.edits.map((part) =>
                              part.material === material
                                ? {
                                    ...part,
                                    patches: patches.length
                                      ? patches
                                      : undefined,
                                  }
                                : part,
                            ),
                          })
                        }
                      />
                    </div>
                  </TabsContent>
                  <TabsContent
                    value='paint'
                    forceMount
                    className='m-0 data-[state=inactive]:hidden'>
                    <ModelMaterialPaint
                      active={tool === "paint"}
                      imageDraft={imageDraft}
                      key={edit.material}
                      addonId={addon.id}
                      imageProjector={imageProjector}
                      imageDrop={imageDrop}
                      imagePlacementTarget={imagePlacementTarget}
                      onPlacementActiveChange={setPlacementActive}
                      surfaceTool={surfaceTool}
                      surfaceEnabled={surfaceEnabled}
                      onSurfaceEnabledChange={setSurfaceEnabled}
                      edit={edit}
                      disabled={multiple || save.isPending || !part.tintable}
                      onChange={change}
                    />
                    {multiple ? (
                      <p className='border-t px-3 py-2 text-[11px] text-muted-foreground'>
                        {t("modelEditor.paintSingleMaterial")}
                      </p>
                    ) : null}
                  </TabsContent>
                </>
              ) : (
                <p className='p-3 text-xs text-muted-foreground'>
                  {t("modelEditor.noSelection")}
                </p>
              )}
              <details className='border-t p-3 text-[11px] text-muted-foreground'>
                <summary className='cursor-pointer text-xs font-medium text-foreground'>
                  {t("modelEditor.editingNotes")}
                </summary>
                <p className='mt-3 leading-relaxed'>
                  {t("modelEditor.sharedHint")}
                </p>
                <p className='mt-2 leading-relaxed'>
                  {t("modelEditor.previewAccuracy")}
                </p>
              </details>
            </ModelEditorTools>
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className='flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-2 py-2.5'>
        <Button
          size='sm'
          variant='outline'
          disabled={save.isPending || !history.past.length}
          onClick={() => dispatch({ type: "undo" })}>
          {t("modelEditor.undo")}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={save.isPending || !history.future.length}
          onClick={() => dispatch({ type: "redo" })}>
          {t("modelEditor.redo")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={save.isPending}
          onClick={() =>
            dispatch({
              type: "change",
              edits: history.edits.map((candidate) =>
                resetModelPart(candidate.material),
              ),
            })
          }>
          {t("modelEditor.restore")}
        </Button>
        {dirty ? (
          <Button
            size='sm'
            variant='outline'
            disabled={
              save.isPending || imagePlacementActive || patchManipulating
            }
            onClick={() => {
              dispatch({ type: "reset", edits: document.edits });
              save.reset();
            }}>
            {t("workbenchAuthoring.discard")}
          </Button>
        ) : null}
        <span role='status' className='ml-auto text-xs text-muted-foreground'>
          {t(
            save.isPending
              ? "modelEditor.saving"
              : imagePlacementActive || patchManipulating
                ? "modelEditor.paint.placementDraft"
                : dirty
                  ? "modelEditor.unsaved"
                  : "modelEditor.saved",
          )}
        </span>
        <Button
          size='sm'
          disabled={
            !dirty ||
            allHidden ||
            save.isPending ||
            imagePlacementActive ||
            patchManipulating
          }
          onClick={() => save.mutate()}>
          {t("modelEditor.save")}
        </Button>
      </div>
      {allHidden || save.error ? (
        <p role='alert' className='pb-2 text-xs text-destructive'>
          {save.error?.message ?? t("modelEditor.keepVisible")}
        </p>
      ) : null}
    </div>
  );
}
