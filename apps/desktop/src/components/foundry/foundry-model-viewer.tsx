import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CompassIcon, CubeIcon } from "@phosphor-icons/react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { retainFoundryModel } from "@/lib/model-assets";
import logger from "@/lib/logger";
import type { FoundryModel } from "@/types/foundry";
import { loadPreviewModel } from "./model-loader";
import {
  createPreviewClip,
  type PreviewPlayback,
} from "@/lib/preview-animation";
import { PreviewClock } from "@/lib/preview-clock";
import {
  installAnimatedMaterials,
  type AnimatedMaterials,
} from "@/lib/animated-materials";
import { createSceneColorCapture } from "@/lib/particles/scene-color";
import { type ViewerCallout, ViewerCallouts } from "./viewer-callouts";
import { colorTextureOf } from "./viewer-color-texture";
import {
  captureSilhouette,
  hasCapturedSilhouette,
} from "./foundry-silhouettes";
import { ModelLoadingStage } from "./model-loading-stage";
import {
  hueOf,
  installPaintShader,
  type PaintableMaterial,
  type PaintUniforms,
} from "./foundry-paint-shader";
import { attachNprOutlines } from "./npr-outline";
import type {
  ViewerEffect,
  ViewerEffectContext,
  ViewerEffectFactory,
} from "./viewer-effects";
import {
  DEFAULT_LOOK,
  overlaySurface,
  ViewerActivePasses,
  ViewerBackgroundButton,
  type ViewerLook,
  type ViewerOverlayToggle,
  ViewerToolRail,
  ViewerViewMenu,
  ViewerWipBadge,
} from "./viewer-tools";
import { createViewerRecorder, captureHeroStill } from "./viewer-capture";
import { disposeObject } from "./viewer-model-resources";
import { createViewerAxisGizmo } from "./viewer-axis-gizmo";
import { createViewerCamera } from "./viewer-camera";
import type { ViewerBackground } from "./viewer-background";
import { createViewerPostFx } from "./viewer-postfx";
import {
  applyMeshGroups,
  type MeshGroupTable,
  readMeshGroups,
} from "./viewer-mesh-groups";
import { createViewerScene } from "./viewer-scene";
import { createViewerPerformance } from "./viewer-performance";
import { ViewerMaterialStatus } from "./viewer-material-status";
import { createViewerComparison } from "./viewer-comparison";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";

interface ViewerComparison {
  model: FoundryModel;
  animation: PreviewAnimation | null;
  effects: ViewerEffectFactory[];
  visible: boolean;
}

/** A live paint preview: the color maps it covers and the exact paint. */
/** Color maps whose files changed; a new `revision` asks for another swap. */
export interface FoundryTextureRefresh {
  paths: readonly string[];
  revision: number;
}

export interface FoundryPreviewTint {
  textures: readonly string[];
  colorHex: string;
  saturation: number;
  brightness: number;
}

interface FoundryModelViewerProps {
  model: FoundryModel;
  comparison?: ViewerComparison;
  onComparisonReady?: (ready: boolean) => void;
  onComparisonFailure?: (failed: boolean) => void;
  label: string;
  /** Paints the matching materials on the GPU, without touching any file, so
   *  the paint tab shows a color the instant it is picked. */
  /** Pending colors, later layers over earlier ones; null when not previewing. */
  tint?: readonly FoundryPreviewTint[] | null;
  /** Color maps of the selected sections, drawn with a faint glow. */
  highlightTextures?: readonly string[];
  /** Color maps the user hid to reach what is behind them; not drawn or picked. */
  hiddenTextures?: readonly string[];
  /** The hero the loading embers build while the model decodes. */
  hero?: string;
  /** The hero whose shape the loading embers should learn from this model. */
  silhouetteHero?: string;
  /** Sections to label on the model, with a leader line to each. */
  callouts?: readonly ViewerCallout[];
  /** Makes sections clickable: a click selects one, Shift or Ctrl adds it. */
  onPickPart?: (texture: string, additive: boolean) => void;
  /** The section name shown while the pointer is over it. */
  partLabel?: (texture: string) => string | undefined;
  playback?: PreviewPlayback;
  /** Simulations attached to the loaded model; rebuilt when the array changes, so memoize it. */
  effects?: ViewerEffectFactory[];
  fullscreenTarget: RefObject<HTMLDivElement | null>;
  /** Extra View menu switches for overlays the caller draws in `children`. */
  overlays?: ViewerOverlayToggle[];
  /** Receives the playback clock every frame, for timelines that must not re-render React. */
  timeRef?: RefObject<number>;
  /** Drawn over the render, inside the viewport. */
  children?: ReactNode;
  /** Edited color maps to swap into the loaded model without a rebuild. */
  textureRefresh?: FoundryTextureRefresh;
  /** Reads a color map's current image as a data URL. */
  readTexture?: (path: string, opaque: boolean) => Promise<string>;
  /** Told whether a model is on screen, for overlays that sit over the stage. */
  onReadyChange?: (ready: boolean) => void;
  /** Receives a still of the hero cropped to its outline, or null once gone. */
  onHeroCapture?: (capture: (() => Promise<Blob | null>) | null) => void;
}

interface MaterialSnapshot {
  /** The paint shader's uniforms for this material. */
  uniforms: PaintUniforms;
  /** The material's color map (lowercase), or null when it has none. */
  texture: string | null;
  material: PaintableMaterial;
}

/** A mesh with its flat ID material for the GPU pick pass. */
interface PickTarget {
  mesh: THREE.Mesh;
  texture: string | null;
  pickMaterial: THREE.MeshBasicMaterial;
}

/** Hovered parts glow brighter than selected ones, so the pointer reads. */
const HOVER_GLOW = 0.32;
const SELECTED_GLOW = 0.14;

/** A pointer that moved more than this between press and release orbited. */
const CLICK_SLOP_PX = 4;

/** How often a still pointer is re-picked while the model or camera moves.
 *  Each pick is a synchronous pixel read, so not every frame. */
const REPICK_INTERVAL_MS = 100;

const isTintable = (material: THREE.Material): material is PaintableMaterial =>
  material instanceof THREE.MeshBasicMaterial ||
  material instanceof THREE.MeshStandardMaterial ||
  material instanceof THREE.MeshPhysicalMaterial ||
  material instanceof THREE.MeshPhongMaterial ||
  material instanceof THREE.MeshLambertMaterial;

/** Clone every material so tinting one model never bleeds into another. */
const cloneSceneMaterials = (root: THREE.Object3D) => {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
};

/** Hook the paint shader into every paintable material and record its uniforms. */
const installPaintShaders = (root: THREE.Object3D): MaterialSnapshot[] => {
  const snapshots: MaterialSnapshot[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!isTintable(material)) continue;
      snapshots.push({
        material,
        uniforms: installPaintShader(material),
        texture: colorTextureOf(material),
      });
    }
  });
  return snapshots;
};

/**
 * One flat-colored stand-in material per mesh for the pick pass. The IDs start
 * at 1 so a cleared pixel (0) means "nothing under the pointer". Built before
 * the outline shells are attached, so those never become pick targets.
 */
const buildPickTargets = (root: THREE.Object3D): PickTarget[] => {
  const targets: PickTarget[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    const id = targets.length + 1;
    targets.push({
      mesh: child,
      texture: colorTextureOf(child.material),
      pickMaterial: new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHex(id, THREE.LinearSRGBColorSpace),
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    });
  });
  return targets;
};

/** Glow the hovered part and, more faintly, the selected ones. */
const applyHighlight = (
  snapshots: MaterialSnapshot[],
  selected: ReadonlySet<string>,
  hovered: string | null,
) => {
  for (const snapshot of snapshots) {
    const texture = snapshot.texture;
    snapshot.uniforms.uPaintHighlight.value =
      texture === null
        ? 0
        : texture === hovered
          ? HOVER_GLOW
          : selected.has(texture)
            ? SELECTED_GLOW
            : 0;
  }
};

/**
 * Point the paint shader at each layer's textures, or switch it off when the
 * tint is null. A texture in several layers wears the last.
 *
 * This only writes uniforms, so it costs nothing per change: the scene already
 * redraws every frame and the transform runs on the GPU. Dragging the picker is
 * therefore free, and what it shows is the same HSV transform an Apply bakes.
 */
const applyPreviewTint = (
  snapshots: MaterialSnapshot[],
  tint: readonly FoundryPreviewTint[] | null | undefined,
) => {
  const layers = new Map<string, FoundryPreviewTint>();
  for (const layer of tint ?? []) {
    for (const texture of layer.textures) {
      layers.set(texture.toLowerCase(), layer);
    }
  }
  for (const snapshot of snapshots) {
    const layer =
      snapshot.texture === null ? undefined : layers.get(snapshot.texture);
    snapshot.uniforms.uPaintActive.value = layer ? 1 : 0;
    if (!layer) continue;
    snapshot.uniforms.uPaintHue.value = hueOf(layer.colorHex);
    snapshot.uniforms.uPaintSaturation.value = layer.saturation;
    snapshot.uniforms.uPaintBrightness.value = layer.brightness;
  }
};

/**
 * Hide the meshes drawn with one of `hidden`'s color maps, outline shells
 * included. Materials rather than meshes, because mesh visibility already
 * belongs to the model's body groups.
 */
const applyHiddenParts = (
  root: THREE.Object3D,
  hidden: ReadonlySet<string>,
) => {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    const texture = colorTextureOf(child.material);
    if (texture === null) return;
    const visible = !hidden.has(texture);
    child.material.visible = visible;
    for (const shell of child.children) {
      if (shell instanceof THREE.Mesh && !Array.isArray(shell.material)) {
        shell.material.visible = visible;
      }
    }
  });
};


export const FoundryModelViewer = ({
  model,
  comparison,
  onComparisonReady,
  onComparisonFailure,
  label,
  tint,
  highlightTextures,
  hiddenTextures,
  hero,
  silhouetteHero,
  callouts,
  onPickPart,
  partLabel,
  playback,
  effects,
  fullscreenTarget,
  overlays = [],
  timeRef,
  children,
  textureRefresh,
  readTexture,
  onReadyChange,
  onHeroCapture,
}: FoundryModelViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<PreviewClock | null>(null);
  const firstAnimationRef = useRef(true);
  const fitRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const snapshotsRef = useRef<MaterialSnapshot[]>([]);
  const hiddenRef = useRef<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  // The frame loop and pick handler read the latest props through refs, so a
  // changed callback never rebuilds the scene.
  const onPickRef = useRef(onPickPart);
  onPickRef.current = onPickPart;
  const pickable = Boolean(onPickPart);
  const pickableRef = useRef(pickable);
  pickableRef.current = pickable;
  const [loading, setLoading] = useState(true);
  const [scanGone, setScanGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [materialDiagnostics, setMaterialDiagnostics] = useState<string[]>([]);
  const [autoRotate, setAutoRotate] = useState(false);
  const [background, setBackground] = useState<ViewerBackground | null>(null);
  const [look, setLook] = useState<ViewerLook>(DEFAULT_LOOK);
  const [showGizmo, setShowGizmo] = useState(true);
  const [meshGroups, setMeshGroups] = useState<MeshGroupTable | null>(null);
  const [bodyChoice, setBodyChoice] = useState<Record<string, number>>({});
  const lookRef = useRef({ background, ...look });
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const recorderRef = useRef<ReturnType<typeof createViewerRecorder> | null>(
    null,
  );
  const applyLookRef = useRef<(() => void) | null>(null);
  const playbackRef = useRef(playback);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const stageRef = useRef<Omit<ViewerEffectContext, "model"> | null>(null);
  const getCamera = useCallback(() => stageRef.current?.camera ?? null, []);
  const activeEffectsRef = useRef<ViewerEffect[]>([]);
  const comparisonRef = useRef<ReturnType<
    typeof createViewerComparison
  > | null>(null);
  const primaryEffectsRef = useRef<THREE.Scene | null>(null);
  const comparisonModel = comparison?.model;
  const [comparisonLoaded, setComparisonLoaded] = useState(false);
  const [comparisonFailed, setComparisonFailed] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    const primary = modelRef.current;
    if (!comparisonModel || !stage || !primary || loading) return;
    const controller = new AbortController();
    const release = retainFoundryModel(comparisonModel);
    let stockRoot: THREE.Object3D | null = null;
    setComparisonLoaded(false);
    setComparisonFailed(false);
    void loadPreviewModel(comparisonModel, controller.signal)
      .then(async (gltf) => {
        const materials = await installAnimatedMaterials(gltf.scene, (index) =>
          gltf.parser.getDependency("texture", index),
        );
        if (controller.signal.aborted) {
          materials.dispose();
          disposeObject(gltf.scene);
          return;
        }
        stockRoot = gltf.scene;
        stockRoot.position.copy(primary.position);
        stockRoot.quaternion.copy(primary.quaternion);
        stockRoot.scale.copy(primary.scale);
        stage.scene.add(stockRoot);
        const stock = createViewerComparison(
          { ...stage, model: stockRoot },
          materials,
        );
        comparisonRef.current = stock;
        stock.setLook(lookRef.current);
        stock.setVisible(false);
        setComparisonLoaded(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setComparisonFailed(true);
          logger
            .withMetadata({ assetId: comparisonModel.assetId })
            .withError(error)
            .warn("[Preview] Could not load comparison model");
        }
      })
      .finally(release);
    return () => {
      controller.abort();
      comparisonRef.current?.dispose();
      comparisonRef.current = null;
      if (stockRoot) {
        stage.scene.remove(stockRoot);
        disposeObject(stockRoot);
      }
      primary.visible = true;
      setComparisonLoaded(false);
    };
  }, [comparisonModel, loading, model]);
  useEffect(() => {
    onComparisonReady?.(comparisonLoaded);
    return () => onComparisonReady?.(false);
  }, [comparisonLoaded, onComparisonReady]);
  useEffect(() => {
    onComparisonFailure?.(comparisonFailed);
  }, [comparisonFailed, onComparisonFailure]);
  useEffect(() => {
    comparisonRef.current?.setAnimation(
      comparison?.animation ?? null,
      clockRef.current?.time ?? 0,
      playback?.animation?.duration ?? 0,
    );
  }, [comparison?.animation, comparisonLoaded, playback?.animation?.duration]);
  useEffect(() => {
    comparisonRef.current?.setEffects(comparison?.effects ?? []);
  }, [comparison?.effects, comparisonLoaded]);
  useEffect(() => {
    const visible = comparisonLoaded && (comparison?.visible ?? false);
    comparisonRef.current?.setVisible(visible);
    if (modelRef.current) modelRef.current.visible = !visible;
    if (primaryEffectsRef.current) primaryEffectsRef.current.visible = !visible;
  }, [comparison?.visible, comparisonLoaded]);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);
  useEffect(() => {
    if (modelRef.current && meshGroups)
      applyMeshGroups(modelRef.current, meshGroups, bodyChoice);
  }, [meshGroups, bodyChoice]);
  useEffect(() => {
    const model = modelRef.current;
    const stage = stageRef.current;
    if (!model || !stage || loading || !effects?.length) return;
    const effectScene = new THREE.Scene();
    stage.scene.add(effectScene);
    primaryEffectsRef.current = effectScene;
    effectScene.visible = !(comparisonLoaded && comparison?.visible);
    const created = effects
      .map((factory) => factory({ ...stage, scene: effectScene, model }))
      .filter((effect): effect is ViewerEffect => effect !== null);
    activeEffectsRef.current = created;
    const duration = playbackRef.current?.animation?.duration ?? 0;
    clockRef.current?.seek(
      duration > 0 ? (mixerRef.current?.time ?? 0) % duration : 0,
    );
    return () => {
      activeEffectsRef.current = [];
      for (const effect of created) effect.dispose();
      stage.scene.remove(effectScene);
      primaryEffectsRef.current = null;
    };
  }, [effects, loading, model]);
  useEffect(() => {
    const root = modelRef.current;
    if (!root || loading) return;
    clockRef.current?.seek(0);
    if (!playback?.animation) return;
    const mixer = new THREE.AnimationMixer(root);
    const clip = createPreviewClip(root, playback.animation);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    actionRef.current = action;
    mixerRef.current = mixer;
    mixer.setTime(0);
    if (firstAnimationRef.current) {
      fitRef.current?.();
      firstAnimationRef.current = false;
    }
    return () => {
      actionRef.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      mixerRef.current = null;
    };
  }, [playback?.animation, loading, model]);
  useEffect(() => {
    if (playback && mixerRef.current) {
      clockRef.current?.seek(playback.seek.time);
    }
  }, [playback?.seek]);

  useEffect(() => {
    lookRef.current = { background, ...look };
    applyLookRef.current?.();
    comparisonRef.current?.setLook(look);
  }, [background, look]);

  // Keep the live controls in sync with the auto-rotate toggle without
  // rebuilding the scene.
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  useEffect(() => {
    const container = containerRef.current;
    const gizmoContainer = gizmoRef.current;
    if (!container || !gizmoContainer) return;

    firstAnimationRef.current = true;
    setFailed(false);
    setLoading(true);
    setScanGone(false);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
    camera.position.set(0, 1.2, 8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    container.appendChild(renderer.domElement);
    const sceneColor = createSceneColorCapture(renderer, scene, camera);
    stageRef.current = { scene, camera, renderer, sceneColor };
    const recorder = createViewerRecorder(renderer.domElement);
    const performanceStats = import.meta.env.DEV
      ? createViewerPerformance(renderer)
      : null;
    recorderRef.current = recorder;

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmremGenerator.fromScene(environment);
    scene.environment = environmentMap.texture;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.7;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 0.5;
    controls.maxDistance = 500;
    controlsRef.current = controls;
    const cameraControls = createViewerCamera(
      camera,
      controls,
      renderer.domElement,
      () => modelRef.current,
    );
    fitRef.current = cameraControls.fit;
    renderer.domElement.setAttribute(
      "aria-label",
      t("modelPreview.cameraHint"),
    );

    const stage = createViewerScene(scene);
    const postFx = createViewerPostFx(renderer, scene, camera);
    let outlines: ReturnType<typeof attachNprOutlines> | null = null;
    const applyLook = () => {
      stage.setBackground(lookRef.current.background?.image ?? null);
      postFx.setBloom(lookRef.current.bloom);
      postFx.setBloomStrength(lookRef.current.bloomStrength);
      stage.setLighting(
        lookRef.current.lighting,
        lookRef.current.lightIntensity,
      );
      outlines?.setVisible(lookRef.current.outlines);
      postFx.setAntialias(lookRef.current.antialias);
      renderer.toneMappingExposure = lookRef.current.exposure;
      for (const snapshot of snapshotsRef.current)
        snapshot.material.wireframe = lookRef.current.wireframe;
    };
    applyLookRef.current = applyLook;
    applyLook();
    captureRef.current = () => {
      sceneColor.capture();
      postFx.render();
      return new Promise((resolve) =>
        renderer.domElement.toBlob(resolve, "image/png"),
      );
    };

    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;
    let animatedMaterials: AnimatedMaterials | null = null;
    let picks: PickTarget[] = [];
    let frame = 0;

    // GPU picking: the model is drawn into a 1x1 target under the pointer with
    // one flat color per mesh, and the pixel read back names the section. A CPU
    // raycast would have to skin every vertex of a 100k-triangle hero per move.
    const pickTarget = new THREE.WebGLRenderTarget(1, 1);
    const pickCamera = new THREE.PerspectiveCamera();
    const pickPixel = new Uint8Array(4);
    const pickPointer = { x: 0, y: 0, inside: false, dirty: false };
    let pointerDown: { x: number; y: number } | null = null;
    let lastHovered: string | null = null;
    let lastPick = 0;

    const setHover = (texture: string | null) => {
      if (texture === lastHovered) return;
      lastHovered = texture;
      setHovered(texture);
    };

    const pickAtPointer = (): string | null => {
      const root = loadedRoot;
      if (!root || picks.length === 0) return null;
      const canvas = renderer.domElement;
      pickCamera.copy(camera);
      pickCamera.setViewOffset(
        canvas.clientWidth,
        canvas.clientHeight,
        Math.floor(pickPointer.x),
        Math.floor(pickPointer.y),
        1,
        1,
      );
      pickCamera.updateProjectionMatrix();
      const saved = picks.map((target) => target.mesh.material);
      for (const target of picks) {
        target.pickMaterial.visible = !(
          target.texture && hiddenRef.current.has(target.texture)
        );
        target.mesh.material = target.pickMaterial;
      }
      // The outline shells keep their own material and would read as an ID.
      outlines?.setVisible(false);
      const previousTarget = renderer.getRenderTarget();
      const previousClear = renderer.getClearColor(new THREE.Color());
      const previousAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(pickTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(root, pickCamera);
      renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClear, previousAlpha);
      outlines?.setVisible(lookRef.current.outlines);
      picks.forEach((target, index) => {
        target.mesh.material = saved[index];
      });
      const id = (pickPixel[0] << 16) | (pickPixel[1] << 8) | pickPixel[2];
      return id > 0 ? (picks[id - 1]?.texture ?? null) : null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pickPointer.x = event.clientX - rect.left;
      pickPointer.y = event.clientY - rect.top;
      pickPointer.inside = true;
      pickPointer.dirty = true;
    };
    const onPointerLeave = () => {
      pickPointer.inside = false;
      setHover(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
      // Shift-click adds to the pick, but the browser would also extend the
      // page's text selection up to the click.
      if (event.shiftKey || event.ctrlKey) event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerDown;
      pointerDown = null;
      if (
        !start ||
        !pickableRef.current ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
          CLICK_SLOP_PX
      ) {
        return;
      }
      onPointerMove(event);
      const texture = pickAtPointer();
      if (texture) {
        onPickRef.current?.(texture, event.shiftKey || event.ctrlKey);
      }
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      stage.resize(width, height);
      postFx.setSize(width, height);
      sceneColor.setSize(width, height, renderer.getPixelRatio());
      outlines?.setViewportHeight(height);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const frameModel = (root: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      root.position.sub(center);
      stage.placeFloor(box);

      cameraControls.fit();
    };

    const loadController = new AbortController();
    const releaseAsset = retainFoundryModel(model);
    void loadPreviewModel(model, loadController.signal)
      .then(async (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        cloneSceneMaterials(gltf.scene);
        const snapshots = installPaintShaders(gltf.scene);
        const installed = await installAnimatedMaterials(gltf.scene, (index) =>
          gltf.parser.getDependency("texture", index),
        );
        if (disposed) {
          installed.dispose();
          disposeObject(gltf.scene);
          return;
        }
        animatedMaterials = installed;
        setMaterialDiagnostics(installed.diagnostics);
        loadedRoot = gltf.scene;
        modelRef.current = gltf.scene;
        snapshotsRef.current = snapshots;
        const table = readMeshGroups(gltf.scene);
        setMeshGroups(table);
        setBodyChoice(table?.defaults ?? {});
        picks = buildPickTargets(gltf.scene);
        outlines = attachNprOutlines(gltf.scene);
        outlines.setViewportHeight(Math.max(container.clientHeight, 1));
        applyLook();
        scene.add(gltf.scene);
        frameModel(gltf.scene);
        setLoading(false);
      })
      .catch(() => {
        if (disposed) return;
        setLoading(false);
        setFailed(true);
      })
      .finally(releaseAsset);

    const gizmo = createViewerAxisGizmo(gizmoContainer, camera, (direction) => {
      const distance = camera.position.distanceTo(controls.target);
      camera.up.set(0, 1, 0);
      if (Math.abs(direction.y) > 0.9) {
        camera.up.set(0, 0, direction.y > 0 ? -1 : 1);
      }
      camera.position
        .copy(controls.target)
        .addScaledVector(direction, distance);
      controls.update();
    });

    const clock = new PreviewClock(
      () => {
        actionRef.current?.reset().play();
        mixerRef.current?.setTime(0);
        for (const effect of activeEffectsRef.current) effect.reset();
        comparisonRef.current?.reset();
      },
      (delta) => {
        mixerRef.current?.update(delta);
        for (const effect of activeEffectsRef.current) effect.update(delta);
        comparisonRef.current?.update(delta);
      },
    );
    clockRef.current = clock;
    let previousTime = performance.now();
    let visible = true;
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    visibility.observe(container);
    const render = () => {
      frame = window.requestAnimationFrame(render);
      const now = performance.now();
      const frameElapsed = (now - previousTime) / 1000;
      const delta = Math.min(frameElapsed, 0.1);
      previousTime = now;
      if (document.hidden || !visible) return;
      const playback = playbackRef.current;
      const simulationStart = performance.now();
      clock.tick(delta, playback?.playing ?? true, playback?.speed ?? 1);
      const simulationEnd = performance.now();
      if (timeRef) timeRef.current = clock.time;
      renderer.domElement.dataset.seeking = String(clock.seeking);
      controls.update();
      animatedMaterials?.update(clock.time);
      comparisonRef.current?.prepare(clock.time);
      for (const effect of activeEffectsRef.current) effect.prepare?.();
      const preparationEnd = performance.now();
      // Re-pick when the pointer moved, and now and then while the camera or
      // the pose moves under a still pointer.
      const moving =
        controls.autoRotate ||
        (mixerRef.current !== null && (playback?.playing ?? true));
      if (
        pickableRef.current &&
        pickPointer.inside &&
        (pickPointer.dirty || (moving && now - lastPick >= REPICK_INTERVAL_MS))
      ) {
        pickPointer.dirty = false;
        lastPick = now;
        setHover(pickAtPointer());
      } else if (!pickableRef.current && lastHovered !== null) {
        setHover(null);
      }
      const submissionStart = performance.now();
      performanceStats?.begin();
      sceneColor.capture();
      postFx.render();
      performanceStats?.end(
        simulationEnd - simulationStart,
        preparationEnd - simulationEnd,
        performance.now() - submissionStart,
        frameElapsed * 1000,
      );

      gizmo.update();
    };
    render();

    return () => {
      disposed = true;
      loadController.abort();
      window.cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      for (const pick of picks) pick.pickMaterial.dispose();
      pickTarget.dispose();
      setHover(null);
      gizmo.dispose();
      resizeObserver.disconnect();
      visibility.disconnect();
      clockRef.current = null;
      modelRef.current = null;
      stageRef.current = null;
      cameraControls.dispose();
      fitRef.current = null;
      controls.dispose();
      controlsRef.current = null;
      snapshotsRef.current = [];
      applyLookRef.current = null;
      captureRef.current = null;
      recorder.dispose();
      performanceStats?.dispose();
      recorderRef.current = null;
      outlines?.dispose();
      animatedMaterials?.dispose();
      sceneColor.dispose();
      postFx.dispose();
      stage.dispose();
      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObject(loadedRoot);
      }
      environmentMap.dispose();
      pmremGenerator.dispose();
      environment.dispose();
      // `dispose()` frees three.js resources but leaves the WebGL context
      // alive; browsers cap how many a page may hold, and this canvas is
      // mounted and unmounted on every repaint, so release it explicitly.
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [model]);

  useEffect(() => {
    applyPreviewTint(snapshotsRef.current, tint);
  }, [tint, loading]);

  useEffect(() => {
    onReadyChange?.(!loading && !failed);
    return () => onReadyChange?.(false);
  }, [loading, failed, onReadyChange]);

  useEffect(() => {
    if (!onHeroCapture || loading || failed) return;
    onHeroCapture(() => {
      const root = modelRef.current;
      const stage = stageRef.current;
      if (!root || !stage) return Promise.resolve(null);
      return captureHeroStill(root, stage.camera, stage.renderer, () =>
        captureRef.current?.(),
      );
    });
    return () => onHeroCapture(null);
  }, [loading, failed, onHeroCapture]);

  // A repaint rewrites color maps on disk. Swapping just those images into the
  // loaded materials keeps the hero, its pose and the camera on screen, where
  // reloading the model would rebuild the whole scene.
  const refreshRevision = textureRefresh?.revision;
  const readTextureRef = useRef(readTexture);
  readTextureRef.current = readTexture;
  const refreshPathsRef = useRef(textureRefresh?.paths);
  refreshPathsRef.current = textureRefresh?.paths;
  useEffect(() => {
    const read = readTextureRef.current;
    const paths = refreshPathsRef.current;
    if (refreshRevision === undefined || !read || !paths?.length) return;
    let cancelled = false;
    for (const path of paths) {
      const key = path.toLowerCase();
      const matching = snapshotsRef.current.filter(
        (snapshot) => snapshot.texture === key && snapshot.material.map,
      );
      for (const opaque of new Set(
        matching.map(
          ({ material }) => !material.transparent && material.alphaTest === 0,
        ),
      )) {
        read(path, opaque)
          .then(async (url) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (cancelled) return;
            for (const snapshot of matching) {
              const map = snapshot.material.map;
              if (
                !map ||
                (!snapshot.material.transparent &&
                  snapshot.material.alphaTest === 0) !== opaque
              )
                continue;
              // GLTF preview maps may be smaller than the edited texture. Free
              // their immutable GPU allocation before uploading the new image.
              map.dispose();
              map.image = image;
              map.needsUpdate = true;
            }
          })
          .catch(() => {
            // The next full load reads the same file; nothing to recover here.
          });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [refreshRevision]);

  // Once posed by the first frames of its animation, the model teaches the
  // loading embers this hero's shape for next time.
  useEffect(() => {
    if (loading || !silhouetteHero || hasCapturedSilhouette(silhouetteHero)) {
      return;
    }
    const timer = window.setTimeout(() => {
      const root = modelRef.current;
      const stage = stageRef.current;
      if (root && stage) {
        captureSilhouette(silhouetteHero, stage.renderer, root);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loading, model, silhouetteHero]);

  useEffect(() => {
    hiddenRef.current = new Set(
      hiddenTextures?.map((texture) => texture.toLowerCase()),
    );
    const root = modelRef.current;
    if (root && !loading) applyHiddenParts(root, hiddenRef.current);
  }, [hiddenTextures, loading, model]);

  useEffect(() => {
    // The selection glow would shift the color being previewed, so it gives
    // way to the tint; the hover glow stays so the pointer still reads.
    applyHighlight(
      snapshotsRef.current,
      new Set(
        tint ? [] : highlightTextures?.map((texture) => texture.toLowerCase()),
      ),
      pickable ? hovered : null,
    );
  }, [highlightTextures, hovered, pickable, tint, loading]);

  const hoveredLabel =
    pickable && hovered ? (partLabel?.(hovered) ?? null) : null;

  return (
    <div className='@container relative h-full w-full overflow-hidden bg-background'>
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full transition-opacity duration-700 ease-out",
          loading && "opacity-0",
          hoveredLabel && "cursor-pointer",
        )}
        title={label}
      />
      <div
        ref={gizmoRef}
        className={cn(
          overlaySurface,
          "absolute top-3 right-3 cursor-pointer overflow-hidden rounded-full bg-background/40",
          !showGizmo && "hidden",
        )}
        style={{ width: 84, height: 84 }}
      />
      <div className='absolute top-3 left-3 flex items-start gap-1.5'>
        <ViewerViewMenu
          look={look}
          onChange={setLook}
          bodyGroups={
            meshGroups && {
              table: meshGroups,
              chosen: bodyChoice,
              onChange: (chosen) => {
                setBodyChoice(chosen);
                if (modelRef.current && meshGroups)
                  applyMeshGroups(modelRef.current, meshGroups, chosen);
                fitRef.current?.();
              },
            }
          }
          overlays={[
            ...overlays,
            {
              id: "gizmo",
              label: t("modelPreview.axisGizmo"),
              icon: CompassIcon,
              checked: showGizmo,
              onCheckedChange: setShowGizmo,
            },
          ]}
        />
        <ViewerBackgroundButton
          background={background}
          onBackgroundChange={setBackground}
        />
        <ViewerActivePasses look={look} />
      </div>
      <div className='absolute bottom-3 left-3 flex items-end gap-2'>
        <ViewerWipBadge />
        {!loading && <ViewerMaterialStatus diagnostics={materialDiagnostics} />}
      </div>
      <ViewerToolRail
        belowGizmo={showGizmo}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        onFit={() => fitRef.current?.()}
        capture={() => captureRef.current?.() ?? Promise.resolve(null)}
        record={() =>
          recorderRef.current?.record() ??
          Promise.reject(new RuntimeError("Viewer is loading"))
        }
        stopRecording={() => recorderRef.current?.stop()}
        fullscreen={async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await fullscreenTarget.current?.requestFullscreen();
        }}
      />
      {!loading && !failed && children}
      {callouts && !loading && (
        <ViewerCallouts
          callouts={callouts}
          containerRef={containerRef}
          getCamera={getCamera}
          modelRef={modelRef}
        />
      )}
      {hoveredLabel && (
        <p
          className={cn(
            overlaySurface,
            "pointer-events-none absolute top-14 left-3 flex h-7 max-w-[calc(100%-7rem)] items-center gap-2 rounded-full px-2.5 text-[11px]",
          )}>
          <span className='truncate font-medium'>{hoveredLabel}</span>
          <span className='shrink-0 text-muted-foreground'>
            {t("foundry.paint.pickHint")}
          </span>
        </p>
      )}

      {!scanGone && !failed && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out",
            !loading && "opacity-0",
          )}
          onTransitionEnd={() => !loading && setScanGone(true)}>
          {/* Only the Foundry teaches silhouettes, and only it has opening
              steps to show. */}
          <ModelLoadingStage
            hero={hero ?? silhouetteHero ?? null}
            status={t("foundry.preview.loading")}
            steps={silhouetteHero !== undefined}
          />
        </div>
      )}
      {failed && (
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground'>
          <CubeIcon className='h-14 w-14 opacity-40' weight='duotone' />
          <p className='text-sm'>{t("foundry.preview.modelDecodeFailed")}</p>
        </div>
      )}
    </div>
  );
};
