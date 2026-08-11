import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArrowsClockwiseIcon, CubeIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import {
  hueOf,
  installPaintShader,
  type PaintableMaterial,
  type PaintUniforms,
} from "./foundry-paint-shader";

/** A live paint preview: which part, and the exact paint being previewed. */
export interface FoundryPreviewTint {
  target: "body" | "weapon" | "bodyAndWeapon" | "abilities";
  colorHex: string;
  saturation: number;
  brightness: number;
}

interface FoundryModelViewerProps {
  dataUrl: string;
  label: string;
  /** Paints the matching materials on the GPU, without touching any file, so
   *  the paint tab shows a color the instant it is picked. */
  tint?: FoundryPreviewTint | null;
}

interface MaterialSnapshot {
  /** The paint shader's uniforms for this material. */
  uniforms: PaintUniforms;
  /** Material and mesh names joined, which is what the part match reads. */
  name: string;
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
  // Ability effects are not part of the mesh, so nothing on it ever matches.
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
      Boolean(tint) && materialMatchesTarget(snapshot, tint!.target);
    snapshot.uniforms.uPaintActive.value = painted ? 1 : 0;
    if (painted && tint) {
      snapshot.uniforms.uPaintHue.value = hue;
      snapshot.uniforms.uPaintSaturation.value = tint.saturation;
      snapshot.uniforms.uPaintBrightness.value = tint.brightness;
    }
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
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
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
  dataUrl,
  label,
  tint,
}: FoundryModelViewerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const gizmoRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const snapshotsRef = useRef<MaterialSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

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

    setFailed(false);
    setLoading(true);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0d);

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

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmremGenerator.fromScene(environment);
    scene.environment = environmentMap.texture;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.7;
    controls.enablePan = false;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 0.5;
    controls.maxDistance = 500;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xe9eef9, 0x242022, 2.6));
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.5);
    keyLight.position.set(2.8, 4.2, 3.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xff4965, 1.1);
    rimLight.position.set(-3.5, 2.4, -2.4);
    scene.add(rimLight);

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
      sprite.userData.dir = dir;
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
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const frameModel = (root: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;

      const center = new THREE.Vector3();
      const sphere = new THREE.Sphere();
      box.getCenter(center);
      box.getBoundingSphere(sphere);
      root.position.sub(center);

      const radius = Math.max(sphere.radius, 1);
      const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      let fitDistance = radius / Math.sin(halfFov);
      if (camera.aspect < 1) {
        fitDistance /= camera.aspect;
      }

      // Snug default framing — just enough margin to keep the model in view.
      const startDistance = fitDistance * 1.3;
      camera.near = Math.max(startDistance / 2000, 0.01);
      camera.far = Math.max(startDistance * 120, 5000);
      camera.position.set(
        startDistance * 0.18,
        startDistance * 0.08,
        startDistance,
      );
      camera.updateProjectionMatrix();

      controls.target.set(0, 0, 0);
      controls.minDistance = Math.max(radius * 0.12, 0.05);
      controls.maxDistance = Math.max(startDistance * 16, radius * 80);
      controls.update();
    };

    const loader = new GLTFLoader();
    loader.load(
      dataUrl,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }

        loadedRoot = gltf.scene;
        cloneSceneMaterials(gltf.scene);
        snapshotsRef.current = installPaintShaders(gltf.scene);
        scene.add(gltf.scene);

        frameModel(gltf.scene);
        setLoading(false);
      },
      undefined,
      () => {
        if (disposed) return;
        setLoading(false);
        setFailed(true);
      },
    );

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
        snapToDir((hit.object.userData.dir as THREE.Vector3).clone());
      }
    };
    gizmoRenderer.domElement.addEventListener("pointerdown", onGizmoClick);
    gizmoRenderer.domElement.style.cursor = "pointer";

    const render = () => {
      controls.update();
      renderer.render(scene, camera);

      // Mirror the main camera's orientation so the gizmo turns with the model.
      gizmoRoot.quaternion.copy(camera.quaternion).invert();
      gizmoRenderer.render(gizmoScene, gizmoCamera);

      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      gizmoRenderer.domElement.removeEventListener("pointerdown", onGizmoClick);
      resizeObserver.disconnect();
      controls.dispose();
      controlsRef.current = null;
      snapshotsRef.current = [];
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
  }, [dataUrl]);

  // Re-tint whenever the picked color changes. The scene already renders every
  // frame, so touching the materials is all that is needed.
  useEffect(() => {
    applyPreviewTint(snapshotsRef.current, tint);
  }, [tint, loading]);

  return (
    <div className='relative h-full w-full overflow-hidden rounded-lg border bg-background'>
      <div ref={containerRef} className='h-full w-full' title={label} />

      <div
        ref={gizmoRef}
        className='absolute top-3 right-3'
        style={{ width: 84, height: 84 }}
      />

      <Button
        className={cn(
          "absolute bottom-3 right-3 h-8 w-8",
          autoRotate && "text-primary",
        )}
        onClick={() => setAutoRotate((value) => !value)}
        size='icon'
        title={t(
          autoRotate ? "foundry.preview.stopSpin" : "foundry.preview.startSpin",
        )}
        variant='secondary'>
        <ArrowsClockwiseIcon
          className={cn("h-4 w-4", autoRotate && "animate-spin")}
          weight='bold'
        />
      </Button>

      {loading && !failed && (
        <div className='absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/90 to-transparent p-4'>
          <span className='text-muted-foreground text-xs'>
            {t("foundry.preview.loading")}
          </span>
          <FoundryLoadingBar />
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
