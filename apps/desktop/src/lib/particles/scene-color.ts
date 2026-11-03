import * as THREE from "three";

export interface SceneColorUniforms {
  sceneColor: { value: THREE.Texture | null };
  sceneDepth: { value: THREE.Texture | null };
  hasSceneColor: { value: number };
  screenSize: { value: THREE.Vector2 };
}

/** One capture per viewer frame, shared by every refractive emitter. */
export interface SceneColorCapture {
  register(object: THREE.Object3D, uniforms: SceneColorUniforms): () => void;
  setSize(width: number, height: number, pixelRatio: number): void;
  capture(): void;
  dispose(): void;
}

export type SceneColorRenderer = Pick<
  THREE.WebGLRenderer,
  | "toneMapping"
  | "autoClear"
  | "getRenderTarget"
  | "getScissorTest"
  | "getViewport"
  | "getScissor"
  | "setViewport"
  | "setScissorTest"
  | "setScissor"
  | "render"
> & {
  xr: { enabled: boolean };
  setRenderTarget(
    target: ReturnType<THREE.WebGLRenderer["getRenderTarget"]>,
  ): void;
  extensions?: Pick<THREE.WebGLRenderer["extensions"], "has">;
};

export const createSceneColorCapture = (
  renderer: SceneColorRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): SceneColorCapture => {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: renderer.extensions?.has("EXT_color_buffer_float")
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const entries = new Map<THREE.Object3D, SceneColorUniforms>();
  const screenSize = new THREE.Vector2(1, 1);
  const viewport = new THREE.Vector4();
  const scissor = new THREE.Vector4();
  const visible: THREE.Object3D[] = [];
  let disposed = false;
  return {
    register(object, uniforms) {
      entries.set(object, uniforms);
      uniforms.sceneColor.value = target.texture;
      uniforms.sceneDepth.value = target.depthTexture;
      uniforms.screenSize.value.copy(screenSize);
      return () => {
        entries.delete(object);
        uniforms.hasSceneColor.value = 0;
        uniforms.sceneColor.value = null;
        uniforms.sceneDepth.value = null;
      };
    },
    setSize(width, height, pixelRatio) {
      screenSize.set(
        Math.max(width * pixelRatio, 1),
        Math.max(height * pixelRatio, 1),
      );
      // HDR color + depth stays below 27 MiB even on large/high-DPI displays.
      const scale = Math.min(1, 1536 / Math.max(screenSize.x, screenSize.y));
      target.setSize(
        Math.max(Math.round(screenSize.x * scale), 1),
        Math.max(Math.round(screenSize.y * scale), 1),
      );
      for (const uniforms of entries.values())
        uniforms.screenSize.value.copy(screenSize);
    },
    capture() {
      if (disposed || entries.size === 0) return;
      visible.length = 0;
      for (const [object, uniforms] of entries) {
        uniforms.hasSceneColor.value = 0;
        let shown = true;
        for (
          let ancestor: THREE.Object3D | null = object;
          ancestor;
          ancestor = ancestor.parent
        )
          if (!ancestor.visible) shown = false;
        if (
          object instanceof THREE.Mesh &&
          object.geometry instanceof THREE.InstancedBufferGeometry &&
          object.geometry.instanceCount === 0
        )
          shown = false;
        if (
          object instanceof THREE.Mesh &&
          object.geometry.drawRange.count === 0
        )
          shown = false;
        if (shown) {
          visible.push(object);
          object.visible = false;
        }
      }
      if (visible.length === 0) return;
      const previous = renderer.getRenderTarget();
      const scissorTest = renderer.getScissorTest();
      const autoClear = renderer.autoClear;
      const toneMapping = renderer.toneMapping;
      const xrEnabled = renderer.xr.enabled;
      renderer.getViewport(viewport);
      renderer.getScissor(scissor);
      try {
        renderer.xr.enabled = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, target.width, target.height);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);
        for (const uniforms of entries.values())
          uniforms.hasSceneColor.value = 1;
      } finally {
        renderer.setRenderTarget(previous);
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.autoClear = autoClear;
        renderer.toneMapping = toneMapping;
        renderer.xr.enabled = xrEnabled;
        for (const object of visible) object.visible = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const uniforms of entries.values()) {
        uniforms.hasSceneColor.value = 0;
        uniforms.sceneColor.value = null;
        uniforms.sceneDepth.value = null;
      }
      entries.clear();
      target.dispose();
    },
  };
};
