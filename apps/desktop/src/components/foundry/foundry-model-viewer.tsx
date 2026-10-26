import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CompassIcon, CubeIcon } from "@phosphor-icons/react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { retainFoundryModel } from "@/lib/model-assets";
import type { FoundryModel } from "@/types/foundry";
import { loadPreviewModel } from "./model-loader";
import {
  createPreviewClip,
  type PreviewPlayback,
} from "@/lib/preview-animation";
import { PreviewClock } from "@/lib/preview-clock";
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
  ViewerBackgroundButton,
  type ViewerLook,
  type ViewerOverlayToggle,
  ViewerToolRail,
  ViewerViewMenu,
  ViewerWipBadge,
} from "./viewer-tools";
import { createViewerRecorder } from "./viewer-capture";
import { createViewerCamera } from "./viewer-camera";
import type { ViewerBackground } from "./viewer-background";
import { createViewerPostFx } from "./viewer-postfx";
import {
  applyMeshGroups,
  type MeshGroupTable,
  readMeshGroups,
} from "./viewer-mesh-groups";
import { createViewerScene } from "./viewer-scene";

/** A live paint preview: which part, and the exact paint being previewed. */
export interface FoundryPreviewTint {
  target: "body" | "weapon" | "bodyAndWeapon" | "abilities";
  colorHex: string;
  saturation: number;
  brightness: number;
}

interface FoundryModelViewerProps {
  model: FoundryModel;
  label: string;
  /** Paints the matching materials on the GPU, without touching any file, so
   *  the paint tab shows a color the instant it is picked. */
  tint?: FoundryPreviewTint | null;
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
}

interface MaterialSnapshot {
  /** The paint shader's uniforms for this material. */
  uniforms: PaintUniforms;
  /** Material and mesh names joined, which is what the part match reads. */
  name: string;
  material: PaintableMaterial;
}

const isTintable = (material: THREE.Material): material is PaintableMaterial =>
  material instanceof THREE.MeshBasicMaterial ||
  material instanceof THREE.MeshStandardMaterial ||
  material instanceof THREE.MeshPhysicalMaterial ||
  material instanceof THREE.MeshPhongMaterial ||
  material instanceof THREE.MeshLambertMaterial;

const WEAPON_TOKENS = [
  "weapon",
  "gun",
  "rifle",
  "pistol",
  "shotgun",
  "cannon",
  "launcher",
  "bow",
  "arrow",
  "blade",
  "sword",
  "knife",
  "staff",
  "wand",
  "mace",
  "club",
  "revolver",
  "smg",
  "bullet",
  "melee",
];

/**
 * Whether a material belongs to the part being painted. This mirrors the
 * backend's material classification (`commands/foundry/paint.rs`) so the preview
 * highlights exactly what an Apply would rewrite. Ability effects are not part
 * of the model, so nothing on the mesh matches them.
 */
const materialMatchesTarget = (
  snapshot: MaterialSnapshot,
  target: FoundryPreviewTint["target"],
): boolean => {
  if (target === "abilities") return false;
  if (target === "bodyAndWeapon") return true;
  const name = snapshot.name.toLowerCase();
  const isWeapon = WEAPON_TOKENS.some((token) => name.includes(token));
  return target === "weapon" ? isWeapon : !isWeapon;
};

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
        name: [material.name, child.name].filter(Boolean).join(" "),
      });
    }
  });
  return snapshots;
};

/**
 * Point the paint shader at `tint`, or switch it off when it is null.
 *
 * This only writes uniforms, so it costs nothing per change: the scene already
 * redraws every frame and the transform runs on the GPU. Dragging the picker is
 * therefore free, and what it shows is the same HSV transform an Apply bakes.
 */
const applyPreviewTint = (
  snapshots: MaterialSnapshot[],
  tint: FoundryPreviewTint | null | undefined,
) => {
  const hue = tint ? hueOf(tint.colorHex) : 0;
  for (const snapshot of snapshots) {
    const painted =
      tint != null && materialMatchesTarget(snapshot, tint.target);
    snapshot.uniforms.uPaintActive.value = painted ? 1 : 0;
    if (!painted) continue;
    snapshot.uniforms.uPaintHue.value = hue;
    snapshot.uniforms.uPaintSaturation.value = tint.saturation;
    snapshot.uniforms.uPaintBrightness.value = tint.brightness;
  }
};

// DMM-themed gizmo palette (dark surface, gold primary accent).
const GIZMO_AXES: {
  dir: [number, number, number];
  label: string;
  color: string;
}[] = [
  { dir: [1, 0, 0], label: "X", color: "#d98d6a" },
  { dir: [0, 1, 0], label: "Y", color: "#e7d5a3" },
  { dir: [0, 0, 1], label: "Z", color: "#8fb0c9" },
  { dir: [-1, 0, 0], label: "", color: "#d98d6a" },
  { dir: [0, -1, 0], label: "", color: "#e7d5a3" },
  { dir: [0, 0, -1], label: "", color: "#8fb0c9" },
];

const disposeObject = (root: THREE.Object3D) => {
  const textures = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          for (const texture of [
            material.map,
            material.normalMap,
            material.roughnessMap,
            material.metalnessMap,
            material.aoMap,
            material.emissiveMap,
          ]) {
            if (texture) textures.add(texture);
          }
        }
        material.dispose();
      }
      if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    }
  });
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    texture.dispose();
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      bitmaps.add(image);
    }
  }
  for (const bitmap of bitmaps) bitmap.close();
};

/** A round handle sprite (filled + labelled for the positive axis, faint ring
 * for the negative one) drawn on a small canvas so it always faces the camera. */
const makeHandleTexture = (
  color: string,
  label: string,
): THREE.CanvasTexture => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  if (label) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#1a1712";
    ctx.font = "bold 34px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r, r + 2);
  } else {
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const FoundryModelViewer = ({
  model,
  label,
  tint,
  playback,
  effects,
  fullscreenTarget,
  overlays = [],
  timeRef,
  children,
}: FoundryModelViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<PreviewClock | null>(null);
  const firstAnimationRef = useRef(true);
  const fitRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const snapshotsRef = useRef<MaterialSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanGone, setScanGone] = useState(false);
  const [failed, setFailed] = useState(false);
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
  const activeEffectsRef = useRef<ViewerEffect[]>([]);
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
    const created = effects
      .map((factory) => factory({ ...stage, model }))
      .filter((effect): effect is ViewerEffect => effect !== null);
    activeEffectsRef.current = created;
    const duration = playbackRef.current?.animation?.duration ?? 0;
    clockRef.current?.seek(
      duration > 0 ? (mixerRef.current?.time ?? 0) % duration : 0,
    );
    return () => {
      activeEffectsRef.current = [];
      for (const effect of created) effect.dispose();
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
    stageRef.current = { scene, camera, renderer };
    const recorder = createViewerRecorder(renderer.domElement);
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
      outlines?.setVisible(lookRef.current.outlines);
      postFx.setAntialias(lookRef.current.antialias);
      renderer.toneMappingExposure = lookRef.current.exposure;
      for (const snapshot of snapshotsRef.current)
        snapshot.material.wireframe = lookRef.current.wireframe;
    };
    applyLookRef.current = applyLook;
    applyLook();
    captureRef.current = () => {
      postFx.render();
      return new Promise((resolve) =>
        renderer.domElement.toBlob(resolve, "image/png"),
      );
    };

    // --- Orientation gizmo (isolated renderer so it can never affect the
    // model view): click an axis handle to snap the camera to that side. ---
    const gizmoSize = 84;
    const gizmoRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    gizmoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    gizmoRenderer.setSize(gizmoSize, gizmoSize);
    gizmoRenderer.outputColorSpace = THREE.SRGBColorSpace;
    gizmoContainer.appendChild(gizmoRenderer.domElement);

    const gizmoScene = new THREE.Scene();
    const gizmoCamera = new THREE.OrthographicCamera(
      -1.6,
      1.6,
      1.6,
      -1.6,
      0,
      4,
    );
    gizmoCamera.position.set(0, 0, 2);
    const gizmoRoot = new THREE.Group();
    gizmoScene.add(gizmoRoot);

    const handles: THREE.Sprite[] = [];
    for (const axis of GIZMO_AXES) {
      const dir = new THREE.Vector3(...axis.dir);
      const material = new THREE.SpriteMaterial({
        map: makeHandleTexture(axis.color, axis.label),
        transparent: true,
        opacity: axis.label ? 1 : 0.55,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(dir);
      sprite.scale.setScalar(axis.label ? 0.62 : 0.44);
      gizmoRoot.add(sprite);
      handles.push(sprite);

      if (axis.label) {
        const axisLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            dir.clone().multiplyScalar(0.8),
          ]),
          new THREE.LineBasicMaterial({
            color: axis.color,
            transparent: true,
            opacity: 0.8,
          }),
        );
        gizmoRoot.add(axisLine);
      }
    }

    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;
    let frame = 0;

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      stage.resize(width, height);
      postFx.setSize(width, height);
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
      .then((gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        loadedRoot = gltf.scene;
        modelRef.current = gltf.scene;
        const table = readMeshGroups(gltf.scene);
        setMeshGroups(table);
        setBodyChoice(table?.defaults ?? {});
        cloneSceneMaterials(gltf.scene);
        snapshotsRef.current = installPaintShaders(gltf.scene);
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

    // Snap the camera to the clicked axis (instant, keeps the current distance).
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const snapToDir = (dir: THREE.Vector3) => {
      const distance = camera.position.distanceTo(controls.target);
      camera.up.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) {
        camera.up.set(0, 0, dir.y > 0 ? -1 : 1);
      }
      camera.position.copy(controls.target).addScaledVector(dir, distance);
      controls.update();
    };
    const onGizmoClick = (event: PointerEvent) => {
      const rect = gizmoRenderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, gizmoCamera);
      const hit = raycaster.intersectObjects(handles)[0];
      if (hit) {
        snapToDir(hit.object.position.clone());
      }
    };
    gizmoRenderer.domElement.addEventListener("pointerdown", onGizmoClick);
    gizmoRenderer.domElement.style.cursor = "pointer";

    const clock = new PreviewClock(
      () => {
        actionRef.current?.reset().play();
        mixerRef.current?.setTime(0);
        for (const effect of activeEffectsRef.current) effect.reset();
      },
      (delta) => {
        mixerRef.current?.update(delta);
        for (const effect of activeEffectsRef.current) effect.update(delta);
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
      const delta = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      if (document.hidden || !visible) return;
      const playback = playbackRef.current;
      clock.tick(delta, playback?.playing ?? true, playback?.speed ?? 1);
      if (timeRef) timeRef.current = clock.time;
      renderer.domElement.dataset.seeking = String(clock.seeking);
      for (const effect of activeEffectsRef.current) effect.update(0);
      controls.update();
      postFx.render();

      // Mirror the main camera's orientation so the gizmo turns with the model.
      gizmoRoot.quaternion.copy(camera.quaternion).invert();
      gizmoRenderer.render(gizmoScene, gizmoCamera);
    };
    render();

    return () => {
      disposed = true;
      loadController.abort();
      window.cancelAnimationFrame(frame);
      gizmoRenderer.domElement.removeEventListener("pointerdown", onGizmoClick);
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
      recorderRef.current = null;
      outlines?.dispose();
      postFx.dispose();
      stage.dispose();
      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObject(loadedRoot);
      }
      for (const handle of handles) {
        handle.material.map?.dispose();
        handle.material.dispose();
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
      gizmoRenderer.dispose();
      gizmoRenderer.forceContextLoss();
      gizmoRenderer.domElement.remove();
    };
  }, [model]);

  useEffect(() => {
    applyPreviewTint(snapshotsRef.current, tint);
  }, [tint, loading]);

  return (
    <div className='@container relative h-full w-full overflow-hidden bg-background'>
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full transition-opacity duration-700 ease-out",
          loading && "opacity-0",
        )}
        title={label}
      />
      <div
        ref={gizmoRef}
        className={cn(
          overlaySurface,
          "absolute top-3 right-3 overflow-hidden rounded-full bg-background/40",
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
        <ViewerWipBadge />
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

      {!scanGone && !failed && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out",
            !loading && "opacity-0",
          )}
          onTransitionEnd={() => !loading && setScanGone(true)}>
          <ModelLoadingStage status={t("foundry.preview.loading")} />
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
