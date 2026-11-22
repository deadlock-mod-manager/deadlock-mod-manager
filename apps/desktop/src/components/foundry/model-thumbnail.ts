import { RuntimeError } from "@deadlock-mods/common/client-errors";
import * as THREE from "three";
import {
  installAnimatedMaterials,
  type AnimatedMaterials,
} from "@/lib/animated-materials";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadPreviewModel } from "./model-loader";
import { createViewerCamera } from "./viewer-camera";
import { captureHeroStill } from "./viewer-capture";
import { disposeObject } from "./viewer-model-resources";
import { createViewerScene } from "./viewer-scene";
import type { FoundryModel } from "@/types/foundry";

/** One small still using the viewer's lighting, camera and cropped hero capture. */
export async function renderModelThumbnail(
  model: FoundryModel,
  signal: AbortSignal,
): Promise<Blob | null> {
  signal.throwIfAborted();
  const gltf = await loadPreviewModel(model, signal);
  let renderer: THREE.WebGLRenderer | null = null;
  let cleanup: (() => void) | null = null;
  let materials: AnimatedMaterials | null = null;
  try {
    materials = await installAnimatedMaterials(gltf.scene, (index) =>
      gltf.parser.getDependency("texture", index),
    );
    materials.update(0);
    signal.throwIfAborted();
    if (model.vertexCount === 0 || model.indexCount === 0) return null;
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setSize(384, 384);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    const scene = new THREE.Scene();
    const stage = createViewerScene(scene);
    scene.background = null;
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmrem.fromScene(environment);
    scene.environment = environmentMap.texture;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    const framing = createViewerCamera(
      camera,
      controls,
      renderer.domElement,
      () => gltf.scene,
    );
    cleanup = () => {
      framing.dispose();
      controls.dispose();
      stage.dispose();
      environmentMap.dispose();
      pmrem.dispose();
      environment.dispose();
    };
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    if (box.isEmpty()) return null;
    gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(gltf.scene);
    framing.fit();
    renderer.render(scene, camera);
    const pixels = new Uint8Array(384 * 384 * 4);
    const context = renderer.getContext();
    context.readPixels(
      0,
      0,
      384,
      384,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixels,
    );
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4)
      if (pixels[index] > 16) visible++;
    if (visible < 128) return null;
    if (context.isContextLost())
      throw new RuntimeError("Thumbnail graphics context was lost");
    const active = renderer;
    const capture = await captureHeroStill(gltf.scene, camera, renderer, () => {
      active.render(scene, camera);
      return new Promise((resolve) =>
        active.domElement.toBlob(resolve, "image/png"),
      );
    });
    signal.throwIfAborted();
    return capture;
  } finally {
    materials?.dispose();
    cleanup?.();
    disposeObject(gltf.scene);
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }
}
