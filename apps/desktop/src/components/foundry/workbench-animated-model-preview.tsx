import type { ModelPaintAnimation } from "@/lib/model-paint-animation";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowUUpLeftIcon,
  SquaresFourIcon,
  WindIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClothEffect } from "@/lib/cloth-sim";
import { getHeroAbilities } from "@/lib/deadlock-api";
import { useSourceParticles } from "@/hooks/use-source-particles";
import { createSourceViewerEffect } from "./particles/viewer-effect";
import { abilityForAction, assignAbilitySlots } from "@/lib/preview-actions";
import { previewHeroAbilities } from "@/lib/preview-hero";
import type { PreviewModelAbility } from "@/types/generated/PreviewModelAbility";
import { ViewerParticlePicker } from "./workbench-particle-picker";
import {
  decodePreviewAnimation,
  decodePreviewCloth,
  listPreviewAnimations,
  type PreviewSource,
} from "@/lib/preview-animation";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import type { FoundryModel } from "@/types/foundry";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import {
  FoundryModelViewer,
  type FoundryPreviewTint,
  type FoundryTextureRefresh,
} from "./workbench-model-viewer";
import type { ViewerEffectFactory } from "./viewer-effects";
import type { ViewerCallout } from "./viewer-callouts";
import { MODEL_PREVIEW_GC_TIME } from "@/lib/model-assets";
import { AbilityBar } from "./workbench-viewer-ability-bar";
import { EffectToggle } from "./viewer-effect-toggle";
import { WorkbenchPlaybackControls } from "./workbench-playback-controls";

import type { ParticleSystemInUse } from "./particles/systems-in-use";
import { ModelParticleList } from "../modding-workbench/model-particle-list";

import type { ModelSurfacePaintTool } from "@/lib/model-surface-paint";
import type { ReactNode, RefObject } from "react";

import type { ModelImageProjector } from "@/lib/model-image-projection";
import type { ModelImageSurfaceDraft } from "@/lib/model-image-surface-preview";

interface Props {
  imageDraft?: RefObject<ModelImageSurfaceDraft | null>;
  pauseForImagePlacement?: boolean;
  viewportOverlay?: ReactNode;
  imageProjector?: RefObject<ModelImageProjector | null>;
  imageDrop?: RefObject<
    ((file: File, point: { x: number; y: number }) => void) | null
  >;
  surfacePaint?: RefObject<ModelSurfacePaintTool | null>;
  onMaterialPick?: (material: string) => void;
  model: FoundryModel;
  label: string;
  source: PreviewSource;
  tint?: readonly FoundryPreviewTint[] | null;
  highlightTextures?: readonly string[];
  hiddenTextures?: readonly string[];
  silhouetteHero?: string;
  callouts?: readonly ViewerCallout[];
  onPickPart?: (texture: string, additive: boolean) => void;
  partLabel?: (texture: string) => string | undefined;
  textureRefresh?: FoundryTextureRefresh;
  readTexture?: (path: string) => Promise<string>;
  onReadyChange?: (ready: boolean) => void;
  onHeroCapture?: (capture: (() => Promise<Blob | null>) | null) => void;
  modelEdits?: readonly ModdingModelPartEdit[];
  modelPatterns?: ReadonlyMap<string, Uint8Array>;
  modelPaints?: ReadonlyMap<string, Uint8Array>;
  modelPaintAnimations?: ReadonlyMap<string, ModelPaintAnimation>;
  materialInputs?: Readonly<Record<string, number>>;
  clipPath?: string;
}

const REST_POSE = "rest";

const HERO_ABILITIES_KEY = "assets:hero-abilities";

/** A clip where the ability lets loose, which starts its beam or shot. */
const RELEASE_CLIP =
  /_(fire|shoot|attack|slam|throw|toss|release|launch)(_|\.|$)/;

export const AnimatedModelPreview = ({
  model,
  label,
  source,
  tint,
  highlightTextures,
  hiddenTextures,
  silhouetteHero,
  callouts,
  onPickPart,
  partLabel,
  textureRefresh,
  readTexture,
  onReadyChange,
  onHeroCapture,
  modelEdits,
  modelPatterns,
  modelPaints,
  modelPaintAnimations,
  materialInputs,
  onMaterialPick,
  clipPath,
  surfacePaint,
  imageProjector,
  imageDrop,
  imageDraft,
  viewportOverlay,
  pauseForImagePlacement = false,
}: Props) => {
  const { t } = useTranslation();
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [seek, setSeek] = useState({ time: 0, revision: 0 });
  const [abilitiesHidden, setAbilitiesHidden] = useState(false);
  const timeRef = useRef(0);
  const [clothOn, setClothOn] = useState(true);
  const [particlesOn, setParticlesOn] = useState(true);
  const [effectSelection, setEffectSelection] = useState<{
    action: string;
    roots: string[];
  }>({ action: "", roots: [] });
  const [particleReport, setParticleReport] = useState<{
    data: FoundryParticleGraph;
    diagnostics: string[];
  } | null>(null);
  const [particleInventory, setParticleInventory] = useState<{
    graph: FoundryParticleGraph;
    systems: ParticleSystemInUse[];
  } | null>(null);
  const modelAssetQuery = {
    enabled: source.entryPath.endsWith(".vmdl_c"),
    staleTime: 60_000,
    gcTime: MODEL_PREVIEW_GC_TIME,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  };
  const cloth = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-cloth",
      source.filePath,
      source.overlayRoot,
      source.revision,
      source.allowAdditiveReference,
      source.entryPath,
    ],
    queryFn: () => decodePreviewCloth(source),
  });
  const heroAbilities = useQuery({
    queryKey: ["stats", HERO_ABILITIES_KEY],
    queryFn: () =>
      cachedFetch(HERO_ABILITIES_KEY, STATS_TTL.assets, getHeroAbilities),
    staleTime: STATS_TTL.assets,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
  const localAbilities = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-model-abilities",
      source.filePath,
      source.entryPath,
      source.overlayRoot,
      source.revision,
    ],
    queryFn: () =>
      invoke<PreviewModelAbility[]>("foundry_model_abilities", {
        filePath: source.filePath,
        entryPath: source.entryPath,
        overlayRoot: source.overlayRoot,
      }),
  });
  const abilities = previewHeroAbilities(
    source.entryPath,
    localAbilities.data,
    heroAbilities.data?.data ?? [],
  );
  const abilityNames = abilities.map((ability) => ability.name);
  const choices = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-clips",
      source.filePath,
      source.overlayRoot,
      source.revision,
      source.allowAdditiveReference,
      source.entryPath,
      ...abilityNames,
    ],
    queryFn: () => listPreviewAnimations(source, abilityNames),
    // The names find clips not prefixed `ability_`; wait for them.
    enabled: modelAssetQuery.enabled && !localAbilities.isPending,
  });
  const explicitClip: PreviewAnimationChoice[] = clipPath
    ? [
        {
          id: clipPath,
          kind: "movement",
          label: clipPath.split("/").pop() ?? clipPath,
          clips: [clipPath],
        },
      ]
    : [];
  const actions = [...explicitClip, ...(choices.data ?? [])];
  // Until something is picked, play the first action (an idle) on its own.
  const action =
    selectedId === REST_POSE
      ? null
      : (actions.find((candidate) => candidate.id === selectedId) ??
        actions[0] ??
        null);
  const animation = useQuery({
    queryKey: [
      "preview-animation",
      source.filePath,
      source.overlayRoot,
      source.revision,
      source.allowAdditiveReference,
      source.entryPath,
      ...(action?.clips ?? []),
    ],
    queryFn: () => decodePreviewAnimation(source, action?.clips ?? []),
    enabled: action !== null,
    // Keep the previous move on screen while the next one decodes.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    gcTime: 30_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const current = action ? (animation.data ?? null) : null;
  const seekTo = (time: number) =>
    setSeek((previous) => ({ time, revision: previous.revision + 1 }));
  const restart = () => seekTo(0);
  const select = (id: string) => {
    setSelectedId(id);
    setPlaying(true);
    restart();
  };
  const { slots } = assignAbilitySlots(actions, abilities);
  const hasAbilityBar = slots.some((slot) => slot.action);
  const abilityClass = abilityForAction(action, abilities)?.className ?? null;
  const additionalRoots =
    effectSelection.action === action?.id ? effectSelection.roots : [];
  const { graph: particles, models: particleModels } = useSourceParticles(
    source,
    abilityClass,
    additionalRoots,
  );
  const loopSeconds = current?.duration ?? 0;
  const releaseSeconds =
    current?.segments.find((segment) =>
      RELEASE_CLIP.test(segment.clipPath.split("/").pop() ?? ""),
    )?.start ?? 0;
  const effects = useMemo<ViewerEffectFactory[]>(
    () => [
      ...(clothOn && cloth.data ? [createClothEffect(cloth.data)] : []),
      ...(particles.data
        ? [
            createSourceViewerEffect(particles.data, particleModels, {
              modelPath: source.entryPath,
              particles: particlesOn,
              period: loopSeconds,
              releaseAt: releaseSeconds,
              onParticlesInUse: (systems) => {
                if (particles.data)
                  setParticleInventory({ graph: particles.data, systems });
              },
              onWarnings: (diagnostics) => {
                if (particles.data)
                  setParticleReport({ data: particles.data, diagnostics });
              },
            }),
          ]
        : []),
    ],
    [
      clothOn,
      cloth.data,
      particlesOn,
      particles.data,
      particleModels,
      loopSeconds,
      releaseSeconds,
      source.entryPath,
    ],
  );
  const effectsLimited =
    (particles.data?.warnings.length ?? 0) > 0 ||
    (particleReport?.data === particles.data &&
      (particleReport?.diagnostics.length ?? 0) > 0);
  const status = animation.isFetching
    ? t("modelPreview.loadingAnimation")
    : animation.isError || choices.isError
      ? t("modelPreview.animationFailed")
      : choices.data && actions.length === 0
        ? t("modelPreview.noAnimations")
        : "";
  const effectsNote =
    particlesOn && (particles.isError || effectsLimited)
      ? t(
          particles.isError
            ? "modelPreview.effectsFailed"
            : "modelPreview.effectsLimited",
        )
      : "";
  return (
    <div
      ref={fullscreenRef}
      className='flex h-full min-h-0 w-full flex-col overflow-hidden bg-background'>
      <div className='relative min-h-0 flex-1'>
        <FoundryModelViewer
          imageDraft={imageDraft}
          imageProjector={imageProjector}
          imageDrop={imageDrop}
          surfacePaint={surfacePaint}
          onMaterialPick={onMaterialPick}
          modelEdits={modelEdits}
          modelPatterns={modelPatterns}
          modelPaints={modelPaints}
          modelPaintAnimations={modelPaintAnimations}
          materialInputs={materialInputs}
          fullscreenTarget={fullscreenRef}
          model={model}
          label={label}
          tint={tint}
          highlightTextures={highlightTextures}
          hiddenTextures={hiddenTextures}
          silhouetteHero={silhouetteHero}
          callouts={callouts}
          onPickPart={onPickPart}
          partLabel={partLabel}
          textureRefresh={textureRefresh}
          readTexture={readTexture}
          onReadyChange={onReadyChange}
          onHeroCapture={onHeroCapture}
          effects={effects}
          timeRef={timeRef}
          playback={{
            animation: current,
            playing: playing && !surfacePaint && !pauseForImagePlacement,
            speed,
            seek,
          }}
          overlays={
            hasAbilityBar
              ? [
                  {
                    id: "abilities",
                    label: t("modelPreview.abilityBar"),
                    icon: SquaresFourIcon,
                    shortcut: "H",
                    checked: !abilitiesHidden,
                    onCheckedChange: (checked) => setAbilitiesHidden(!checked),
                  },
                ]
              : []
          }>
          {viewportOverlay}
        </FoundryModelViewer>
      </div>
      {hasAbilityBar && !pauseForImagePlacement ? (
        <AbilityBar
          slots={slots}
          activeId={action?.id}
          onSelect={select}
          hidden={abilitiesHidden}
          onHiddenChange={setAbilitiesHidden}
          animation={current}
          timeRef={timeRef}
        />
      ) : null}
      <div className='shrink-0'>
        <WorkbenchPlaybackControls
          actions={actions}
          selected={action}
          animation={current}
          timeRef={timeRef}
          playing={playing}
          disabled={pauseForImagePlacement}
          speed={speed}
          onPlayingChange={setPlaying}
          onSpeedChange={setSpeed}
          onSelect={select}
          onSeek={seekTo}
          onRestart={restart}>
          <div className='flex flex-wrap gap-2'>
            {cloth.data ? (
              <EffectToggle
                showLabel
                icon={WindIcon}
                label={t("modelPreview.cloth")}
                on={clothOn}
                onChange={setClothOn}
              />
            ) : null}
            {particles.data ? (
              <>
                <EffectToggle
                  showLabel
                  icon={SparkleIcon}
                  label={t("modelPreview.particles")}
                  on={particlesOn}
                  onChange={setParticlesOn}
                />
                <ViewerParticlePicker
                  effects={particles.data.abilityEffects}
                  selected={additionalRoots}
                  pending={particles.isFetching}
                  onChange={(roots) =>
                    setEffectSelection({ action: action?.id ?? "", roots })
                  }
                />
              </>
            ) : null}
            <Button
              size='sm'
              variant='ghost'
              disabled={!actions.some((candidate) => candidate.id === "idle")}
              onClick={() => select("idle")}>
              <ArrowUUpLeftIcon />
              {t("modelPreview.returnToIdle")}
            </Button>
          </div>
          {effectsNote ? (
            <p role='status' className='text-xs text-muted-foreground'>
              {effectsNote}
            </p>
          ) : null}
          <ModelParticleList
            pending={particles.isFetching}
            systems={
              particleInventory && particleInventory.graph === particles.data
                ? particleInventory.systems
                : []
            }
          />
        </WorkbenchPlaybackControls>
        {current?.additiveReferencePose ? (
          <p className='text-xs text-muted-foreground'>
            {t("modelPreview.additiveReferencePose")}
          </p>
        ) : null}
        {status && (
          <p className='text-muted-foreground text-xs' role='status'>
            {status}
            {(animation.isError || choices.isError) && (
              <button
                type='button'
                className='ml-2 underline'
                onClick={() =>
                  void (animation.isError
                    ? animation.refetch()
                    : choices.refetch())
                }>
                {t("skins.preview.retry")}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
};
