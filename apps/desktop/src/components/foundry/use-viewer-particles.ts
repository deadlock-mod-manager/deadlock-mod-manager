import { useQuery } from "@tanstack/react-query";
import {
  type ComponentProps,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { particleAssetDiagnostics } from "@/lib/particles/diagnostics";
import {
  compileParticleEffects,
  createParticleEffect,
  type ParticlePreviewControls,
} from "@/lib/particles/effect";
import type { ParticleDiagnostic } from "@/lib/particles/types";
import {
  decodePreviewAbilityParticles,
  decodePreviewEffect,
  decodePreviewParticles,
  listPreviewEffects,
  type PreviewSource,
} from "@/lib/preview-animation";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import { useParticleModels } from "./use-particle-models";
import { restartEvery, type ViewerEffectFactory } from "./viewer-effects";
import type { ViewerParticlePicker } from "./viewer-particle-picker";

interface Options {
  source: PreviewSource;
  heroName: string;
  abilityClasses: string[];
  abilityClass: string | null;
  animation: PreviewAnimation | null;
  abilitiesReady: boolean;
  timeRef: RefObject<number>;
  onRestart: () => void;
}

/** A clip where the ability lets loose, which starts its beam or shot. */
const RELEASE_CLIP =
  /_(fire|shoot|attack|slam|throw|toss|release|launch)(_|\.|$)/;

/** Owns particle discovery, dependency assets and inspection on the viewer clock. */
export function useViewerParticles({
  source,
  heroName,
  abilityClasses,
  abilityClass,
  animation,
  abilitiesReady,
  timeRef,
  onRestart,
}: Options) {
  const { t } = useTranslation();
  const [particlesOn, setParticlesOn] = useState(true);
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);
  const [controls, setControls] = useState<ParticlePreviewControls>({
    charge: 0,
    released: false,
    target: [100, 0, 0],
    markers: false,
    isolatedPath: null,
    inputsEnabled: false,
  });
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);
  const [reports, setReports] = useState<
    {
      data: PreviewParticles;
      diagnostics: ParticleDiagnostic[];
    }[]
  >([]);
  const modelAssetQuery = {
    enabled: source.entryPath.endsWith(".vmdl_c"),
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  };
  const particles = useQuery({
    ...modelAssetQuery,
    queryKey: ["preview-particles", source.filePath, source.entryPath],
    queryFn: () => decodePreviewParticles(source),
    enabled: modelAssetQuery.enabled && particlesOn,
  });
  const effectChoices = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-effect-choices",
      source.filePath,
      source.entryPath,
      heroName,
      ...abilityClasses,
    ],
    queryFn: () => listPreviewEffects(source, heroName, abilityClasses),
    enabled: modelAssetQuery.enabled && particlesOn && abilitiesReady,
  });
  const inspectedEffect = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-effect",
      source.filePath,
      source.entryPath,
      selectedEffect,
    ],
    queryFn: () => decodePreviewEffect(source, selectedEffect ?? ""),
    enabled: modelAssetQuery.enabled && particlesOn && selectedEffect !== null,
  });
  const abilityParticles = useQuery({
    ...modelAssetQuery,
    queryKey: [
      "preview-ability-particles",
      source.filePath,
      source.entryPath,
      abilityClass,
    ],
    queryFn: () => decodePreviewAbilityParticles(source, abilityClass ?? ""),
    enabled: modelAssetQuery.enabled && particlesOn && abilityClass !== null,
    gcTime: 30_000,
  });
  const castEffects = abilityParticles.data?.cast.systems.length
    ? abilityParticles.data.cast
    : null;
  const releaseEffects = abilityParticles.data?.release.systems.length
    ? abilityParticles.data.release
    : null;
  const loopSeconds = animation?.duration ?? 0;
  const releaseSeconds =
    animation?.segments.find((segment) =>
      RELEASE_CLIP.test(segment.clipPath.split("/").pop() ?? ""),
    )?.start ?? 0;
  const ambientEffects = selectedEffect ? inspectedEffect.data : particles.data;
  const activeData = useMemo(
    () =>
      particlesOn
        ? [
            ambientEffects,
            ...(selectedEffect ? [] : [castEffects, releaseEffects]),
          ].filter((data): data is PreviewParticles => Boolean(data))
        : [],
    [particlesOn, ambientEffects, selectedEffect, castEffects, releaseEffects],
  );
  const {
    models,
    materials,
    loading: modelsLoading,
  } = useParticleModels(source, activeData);
  const compiled = useMemo(
    () => activeData.map(compileParticleEffects),
    [activeData],
  );
  const reportParticles = useCallback(
    (data: PreviewParticles, diagnostics: ParticleDiagnostic[]) => {
      setReports((previous) => [
        ...previous.filter((report) => report.data !== data).slice(-2),
        { data, diagnostics },
      ]);
    },
    [],
  );
  const diagnostics = useMemo(() => {
    const unique = new Map<string, ParticleDiagnostic>();
    for (const [index, data] of activeData.entries()) {
      const reported =
        reports.find((report) => report.data === data)?.diagnostics ??
        compiled[index]?.diagnostics ??
        [];
      for (const diagnostic of particleAssetDiagnostics(data).concat(
        reported,
      )) {
        if (modelsLoading && diagnostic.detail?.startsWith("model-asset:"))
          continue;
        const key = JSON.stringify([
          diagnostic.path,
          diagnostic.stage,
          diagnostic.className,
          diagnostic.code,
          diagnostic.detail ?? "",
        ]);
        unique.set(key, diagnostic);
      }
    }
    return [...unique.values()];
  }, [activeData, compiled, reports, modelsLoading]);
  const emitterPaths = useMemo(() => {
    const paths = new Set<string>();
    const add = (
      systems: ReturnType<typeof compileParticleEffects>["roots"],
    ) => {
      for (const system of systems) {
        paths.add(system.path);
        add(system.children);
      }
    };
    for (const effect of compiled) add(effect.roots);
    return [...paths];
  }, [compiled]);
  const effects = useMemo<ViewerEffectFactory[]>(
    () => [
      ...(materials?.length
        ? [
            () => ({
              reset() {
                for (const material of materials) material.update(0);
              },
              update() {},
              prepare() {
                for (const material of materials)
                  material.update(timeRef.current);
              },
              dispose() {},
            }),
          ]
        : []),
      ...(particlesOn && ambientEffects?.systems.length
        ? [
            createParticleEffect(ambientEffects, {
              prewarm: selectedEffect ? false : undefined,
              autoReplay: !selectedEffect,
              modelAssets: models,
              controls: () => controlsRef.current,
              onDiagnostics: (diagnostics) =>
                reportParticles(ambientEffects, diagnostics),
            }),
          ]
        : []),
      ...(particlesOn && !selectedEffect && castEffects
        ? [
            restartEvery(
              createParticleEffect(castEffects, {
                prewarm: false,
                modelAssets: models,
                controls: () => controlsRef.current,
                onDiagnostics: (diagnostics) =>
                  reportParticles(castEffects, diagnostics),
              }),
              loopSeconds,
              0,
              releaseSeconds > 0 ? releaseSeconds : undefined,
            ),
          ]
        : []),
      ...(particlesOn && !selectedEffect && releaseEffects
        ? [
            restartEvery(
              createParticleEffect(releaseEffects, {
                prewarm: false,
                modelAssets: models,
                controls: () => controlsRef.current,
                onDiagnostics: (diagnostics) =>
                  reportParticles(releaseEffects, diagnostics),
              }),
              loopSeconds,
              releaseSeconds,
            ),
          ]
        : []),
    ],
    [
      particlesOn,
      ambientEffects,
      selectedEffect,
      models,
      materials,
      castEffects,
      releaseEffects,
      loopSeconds,
      releaseSeconds,
      reportParticles,
      timeRef,
    ],
  );
  const effectsFailed = selectedEffect
    ? inspectedEffect.isError
    : particles.isError || abilityParticles.isError;
  const effectsNote =
    particlesOn && (effectsFailed || diagnostics.length > 0)
      ? t(
          effectsFailed
            ? "modelPreview.effectsFailed"
            : "modelPreview.effectsLimited",
        )
      : "";
  const pickerProps: ComponentProps<typeof ViewerParticlePicker> = {
    enabled: particlesOn,
    onEnabled: setParticlesOn,
    choices: effectChoices.data ?? [],
    selected: selectedEffect,
    onSelect: (path) => {
      setSelectedEffect(path);
      setControls((previous) => ({
        ...previous,
        isolatedPath: null,
        released: false,
      }));
      onRestart();
    },
    loading:
      modelsLoading ||
      effectChoices.isFetching ||
      inspectedEffect.isFetching ||
      abilityParticles.isFetching ||
      particles.isFetching,
    failed: effectChoices.isError || effectsFailed,
    onRetry: () => {
      void effectChoices.refetch();
      void (selectedEffect ? inspectedEffect.refetch() : particles.refetch());
      if (!selectedEffect && abilityClass) void abilityParticles.refetch();
    },
    controls,
    onControls: (next) => {
      if (controls.released && !next.released) onRestart();
      setControls((previous) =>
        next.released && !previous.released
          ? { ...next, releaseTime: timeRef.current }
          : next,
      );
    },
    paths: emitterPaths,
    diagnostics,
  };
  return { effects, pickerProps, effectsNote };
}
