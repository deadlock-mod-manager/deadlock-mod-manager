import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowUUpLeftIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SquaresFourIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createClothEffect } from "@/lib/cloth-sim";
import { getHeroAbilities } from "@/lib/deadlock-api";
import { assignAbilitySlots } from "@/lib/preview-actions";
import {
  decodePreviewAnimation,
  decodePreviewCloth,
  listPreviewAnimations,
  type PreviewSource,
} from "@/lib/preview-animation";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import { useStockPreview } from "./use-stock-preview";
import { PreviewDiagnostics } from "./preview-diagnostics";
import type { FoundryModel } from "@/types/foundry";
import {
  FoundryModelViewer,
  type FoundryPreviewTint,
  type FoundryTextureRefresh,
} from "./foundry-model-viewer";
import { ViewerAnimationPicker } from "./viewer-animation-picker";
import { ViewerParticlePicker } from "./viewer-particle-picker";
import { useViewerParticles } from "./use-viewer-particles";
import type { ViewerEffectFactory } from "./viewer-effects";
import type { ViewerCallout } from "./viewer-callouts";
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
  comparisonSource?: PreviewSource;
  comparisonRevision?: string;
  comparisonAvailable?: boolean;
  tint?: readonly FoundryPreviewTint[] | null;
  highlightTextures?: readonly string[];
  hiddenTextures?: readonly string[];
  hero?: string;
  silhouetteHero?: string;
  callouts?: readonly ViewerCallout[];
  onPickPart?: (texture: string, additive: boolean) => void;
  partLabel?: (texture: string) => string | undefined;
  textureRefresh?: FoundryTextureRefresh;
  readTexture?: (path: string, opaque: boolean) => Promise<string>;
  onReadyChange?: (ready: boolean) => void;
  onHeroCapture?: (capture: (() => Promise<Blob | null>) | null) => void;
}

const REST_POSE = "rest";

const HERO_ABILITIES_KEY = "assets:hero-abilities";

export const AnimatedModelPreview = ({
  model,
  label,
  source,
  comparisonSource,
  comparisonRevision,
  comparisonAvailable,
  tint,
  highlightTextures,
  hiddenTextures,
  hero: loadingHero,
  silhouetteHero,
  callouts,
  onPickPart,
  partLabel,
  textureRefresh,
  readTexture,
  onReadyChange,
  onHeroCapture,
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
  const [comparisonRequested, setComparisonRequested] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [comparisonReady, setComparisonReady] = useState(false);
  const [comparisonLoadFailed, setComparisonLoadFailed] = useState(false);
  const modelAssetQuery = {
    enabled: source.entryPath.endsWith(".vmdl_c"),
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  };
  const cloth = useQuery({
    ...modelAssetQuery,
    queryKey: ["preview-cloth", source.filePath, source.entryPath],
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
  // The hero whose model folder holds this model; the longest folder wins so
  // `nano/nano_v2/` beats `nano/`.
  const hero = (heroAbilities.data?.data ?? [])
    .filter((set) => source.entryPath.startsWith(set.modelDirectory))
    .sort((a, b) => b.modelDirectory.length - a.modelDirectory.length)[0];
  const abilityNames = hero?.abilities.map((ability) => ability.name) ?? [];
  const abilityClasses =
    hero?.abilities.map((ability) => ability.className) ?? [];
  const choices = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-clips",
      source.filePath,
      source.entryPath,
      ...abilityNames,
    ],
    queryFn: () => listPreviewAnimations(source, abilityNames),
    // The names find clips not prefixed `ability_`; wait for them.
    enabled: modelAssetQuery.enabled && !heroAbilities.isPending,
  });
  const actions = choices.data ?? [];
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
  const stock = useStockPreview(
    comparisonSource,
    comparisonRevision,
    comparisonRequested,
    action?.clips ?? [],
    clothOn,
  );
  const comparisonBusy =
    stock.model.isFetching ||
    (!!action && stock.animation.isFetching) ||
    (!!stock.model.data && !comparisonReady);
  const comparisonFailed =
    stock.model.isError || stock.animation.isError || comparisonLoadFailed;
  const stockVisible =
    showStock &&
    comparisonReady &&
    !comparisonFailed &&
    (!action || !!stock.animation.data);
  const seekTo = (time: number) =>
    setSeek((previous) => ({ time, revision: previous.revision + 1 }));
  const restart = () => seekTo(0);
  const select = (id: string) => {
    setSelectedId(id);
    setPlaying(true);
    restart();
  };
  const { slots } = assignAbilitySlots(actions, hero?.abilities ?? []);
  const hasAbilityBar = slots.some((slot) => slot.action);
  const abilityClass =
    slots.find((slot) => action && slot.action?.id === action.id)?.ability
      .className ?? null;
  const {
    effects: particleEffects,
    pickerProps,
    effectsNote,
  } = useViewerParticles({
    source,
    heroName: loadingHero ?? silhouetteHero ?? "",
    abilityClasses,
    abilityClass,
    animation: current,
    abilitiesReady: !heroAbilities.isPending,
    timeRef,
    onRestart: restart,
  });
  const effects = useMemo<ViewerEffectFactory[]>(
    () => [
      ...(clothOn && cloth.data ? [createClothEffect(cloth.data)] : []),
      ...particleEffects,
    ],
    [clothOn, cloth.data, particleEffects],
  );
  const status = animation.isFetching
    ? t("modelPreview.loadingAnimation")
    : animation.isError || choices.isError
      ? t("modelPreview.animationFailed")
      : choices.data && actions.length === 0
        ? t("modelPreview.noAnimations")
        : "";
  return (
    <div
      ref={fullscreenRef}
      className='flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-background'>
      <div className='relative min-h-0 flex-1'>
        <FoundryModelViewer
          fullscreenTarget={fullscreenRef}
          model={model}
          comparison={
            stock.model.data
              ? {
                  model: stock.model.data,
                  animation: action ? (stock.animation.data ?? null) : null,
                  effects: stock.effects,
                  visible: stockVisible,
                }
              : undefined
          }
          onComparisonReady={setComparisonReady}
          onComparisonFailure={setComparisonLoadFailed}
          label={label}
          tint={tint}
          highlightTextures={highlightTextures}
          hiddenTextures={hiddenTextures}
          hero={loadingHero}
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
          <PreviewDiagnostics
            model={stockVisible && stock.model.data ? stock.model.data : model}
            animationFailed={animation.isError || choices.isError}
            effectsLimited={
              !!effectsNote ||
              cloth.isError ||
              (stockVisible &&
                (stock.cloth.isError || particleEffects.length > 0))
            }
            effectDiagnostics={pickerProps.diagnostics}
          />
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
      <div className='@container/transport shrink-0 space-y-2 border-t bg-muted/30 px-3 py-2'>
        <div className='flex flex-wrap items-center gap-2'>
          {comparisonAvailable !== undefined && (
            <Button
              size='sm'
              variant={stockVisible ? "secondary" : "outline"}
              className='h-8 shrink-0 text-xs'
              aria-pressed={stockVisible}
              disabled={!comparisonAvailable}
              title={t(
                comparisonAvailable
                  ? "modPreview.compareHint"
                  : "modPreview.noStock",
              )}
              onClick={() => {
                setComparisonRequested(true);
                setShowStock(!showStock);
              }}>
              {t(
                comparisonBusy && showStock
                  ? "modPreview.loadingStock"
                  : stockVisible
                    ? "modPreview.showMod"
                    : "modPreview.showStock",
              )}
            </Button>
          )}
          <Button
            size='icon'
            variant={playing ? "default" : "secondary"}
            className='size-8 shrink-0'
            disabled={!modelAssetQuery.enabled}
            aria-label={t(playing ? "modelPreview.pause" : "modelPreview.play")}
            onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon weight='fill' /> : <PlayIcon weight='fill' />}
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='hidden size-8 shrink-0 @[44rem]/transport:inline-flex'
            disabled={!modelAssetQuery.enabled}
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
            className='hidden h-8 shrink-0 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground @[44rem]/transport:inline-flex'
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
            className='min-w-40 flex-1 basis-40 px-1'
          />
          {cloth.data && (
            <EffectToggle
              icon={WindIcon}
              label={t("modelPreview.cloth")}
              on={clothOn}
              onChange={setClothOn}
            />
          )}
          <ViewerParticlePicker {...pickerProps} />
          <div className='hidden @[40rem]/transport:block'>
            <SpeedPicker speed={speed} onChange={setSpeed} />
          </div>
        </div>
        {comparisonFailed && (
          <p role='status' className='text-muted-foreground text-xs'>
            {t("modPreview.comparisonFailed")}{" "}
            <button
              type='button'
              className='underline'
              onClick={() => {
                void stock.model.refetch();
                if (action) void stock.animation.refetch();
              }}>
              {t("skins.preview.retry")}
            </button>
          </p>
        )}
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
