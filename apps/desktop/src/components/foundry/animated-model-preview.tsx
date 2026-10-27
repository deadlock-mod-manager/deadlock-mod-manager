import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowUUpLeftIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SquaresFourIcon,
  WarningIcon,
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
import { ViewerParticlePicker } from "./viewer-particle-picker";
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
} from "./foundry-model-viewer";
import { ViewerAnimationPicker } from "./viewer-animation-picker";
import type { ViewerEffectFactory } from "./viewer-effects";
import { overlaySurface } from "./viewer-tools";
import {
  AbilityBar,
  EffectToggle,
  SpeedPicker,
  Timeline,
} from "./viewer-transport";

interface Props {
  model: FoundryModel;
  label: string;
  source: PreviewSource;
  tint?: FoundryPreviewTint | null;
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
  clipPath,
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
  const modelAssetQuery = {
    enabled: source.entryPath.endsWith(".vmdl_c"),
    staleTime: 60_000,
    gcTime: 0,
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
      className='flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-background'>
      <div className='relative min-h-0 flex-1'>
        <FoundryModelViewer
          fullscreenTarget={fullscreenRef}
          model={model}
          label={label}
          tint={tint}
          effects={effects}
          timeRef={timeRef}
          playback={{
            animation: current,
            playing,
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
          {effectsNote && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  role='status'
                  className={cn(
                    overlaySurface,
                    "absolute top-14 left-3 flex h-7 max-w-[calc(100%-7rem)] items-center gap-1.5 rounded-full px-2.5 text-[11px] text-muted-foreground",
                  )}>
                  <WarningIcon
                    className='size-3.5 shrink-0 text-amber-400'
                    weight='fill'
                  />
                  <span className='truncate'>{effectsNote}</span>
                </p>
              </TooltipTrigger>
              <TooltipContent side='bottom' className='max-w-64'>
                {effectsNote}
              </TooltipContent>
            </Tooltip>
          )}
          {hasAbilityBar && (
            <AbilityBar
              slots={slots}
              activeId={action?.id}
              onSelect={select}
              hidden={abilitiesHidden}
              onHiddenChange={setAbilitiesHidden}
              animation={current}
              timeRef={timeRef}
            />
          )}
        </FoundryModelViewer>
      </div>
      <div className='shrink-0 space-y-2 border-t bg-muted/30 px-3 py-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='icon'
            variant={playing ? "default" : "secondary"}
            className='size-8 shrink-0'
            disabled={!current}
            aria-label={t(playing ? "modelPreview.pause" : "modelPreview.play")}
            onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon weight='fill' /> : <PlayIcon weight='fill' />}
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='size-8 shrink-0'
            disabled={!current}
            aria-label={t("modelPreview.restart")}
            title={t("modelPreview.restart")}
            onClick={restart}>
            <SkipBackIcon />
          </Button>
          <ViewerAnimationPicker
            actions={actions}
            selected={action}
            onSelect={select}
          />
          <Button
            size='sm'
            variant='ghost'
            className='h-8 shrink-0 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground'
            disabled={
              action?.id === "idle" ||
              !actions.some((candidate) => candidate.id === "idle")
            }
            aria-label={t("modelPreview.returnToIdle")}
            title={t("modelPreview.returnToIdle")}
            onClick={() => select("idle")}>
            <ArrowUUpLeftIcon />
            {t("modelPreview.actions.idle")}
          </Button>
          <Timeline
            animation={current}
            timeRef={timeRef}
            onSeek={seekTo}
            className='min-w-64 flex-1 basis-64 px-1'
          />
          {cloth.data && (
            <EffectToggle icon={WindIcon} on={clothOn} onChange={setClothOn}>
              {t("modelPreview.cloth")}
            </EffectToggle>
          )}
          {particles.data ? (
            <>
              <EffectToggle
                icon={SparkleIcon}
                on={particlesOn}
                onChange={setParticlesOn}>
                {t("modelPreview.particles")}
              </EffectToggle>
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
          <SpeedPicker speed={speed} onChange={setSpeed} />
        </div>
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
