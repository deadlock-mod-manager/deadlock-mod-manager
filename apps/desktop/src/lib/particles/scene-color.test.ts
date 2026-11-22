import { expect, test } from "bun:test";
import * as THREE from "three";
import {
  createSceneColorCapture,
  type SceneColorRenderer,
  type SceneColorUniforms,
} from "./scene-color";

const uniforms = (): SceneColorUniforms => ({
  sceneColor: { value: null },
  sceneDepth: { value: null },
  hasSceneColor: { value: 0 },
  screenSize: { value: new THREE.Vector2() },
});

test("distortion captures once for all emitters, excludes feedback, bounds resolution and restores renderer state", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const first = new THREE.Object3D(),
    second = new THREE.Object3D();
  scene.add(first, second);
  const original = new THREE.WebGLRenderTarget(10, 10);
  let active: ReturnType<SceneColorRenderer["getRenderTarget"]> = original;
  let captured: ReturnType<SceneColorRenderer["getRenderTarget"]> = null;
  let renders = 0;
  let scissorTest = true;
  const viewport = new THREE.Vector4(2, 3, 4, 5);
  const scissor = new THREE.Vector4(6, 7, 8, 9);
  const renderer: SceneColorRenderer = {
    xr: { enabled: true },
    autoClear: false,
    toneMapping: THREE.ACESFilmicToneMapping,
    getRenderTarget: () => active,
    getScissorTest: () => scissorTest,
    getViewport: (out) => out.copy(viewport),
    getScissor: (out) => out.copy(scissor),
    setRenderTarget: (target) => {
      active = target;
    },
    setScissorTest: (enabled) => {
      scissorTest = enabled;
    },
    setViewport: (x, y, width, height) => {
      if (x instanceof THREE.Vector4) viewport.copy(x);
      else viewport.set(x, y ?? 0, width ?? 0, height ?? 0);
    },
    setScissor: (x, y, width, height) => {
      if (x instanceof THREE.Vector4) scissor.copy(x);
      else scissor.set(x, y ?? 0, width ?? 0, height ?? 0);
    },
    render: () => {
      renders += 1;
      expect(first.visible).toBe(false);
      expect(second.visible).toBe(false);
      expect(active).not.toBe(original);
      captured = active;
      expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
      expect(renderer.xr.enabled).toBe(false);
    },
  };
  const a = uniforms(),
    b = uniforms();
  const capture = createSceneColorCapture(renderer, scene, camera);
  const unregisterA = capture.register(first, a);
  const unregisterB = capture.register(second, b);
  capture.setSize(3840, 2160, 2);
  capture.capture();
  expect(renders).toBe(1);
  expect(a.sceneColor.value).toBe(b.sceneColor.value);
  expect(a.sceneDepth.value).toBe(b.sceneDepth.value);
  expect(a.screenSize.value.toArray()).toEqual([7680, 4320]);
  expect(a.hasSceneColor.value).toBe(1);
  expect(first.visible).toBe(true);
  expect(second.visible).toBe(true);
  expect(active).toBe(original);
  expect(viewport.toArray()).toEqual([2, 3, 4, 5]);
  expect(scissor.toArray()).toEqual([6, 7, 8, 9]);
  expect(scissorTest).toBe(true);
  expect(renderer.autoClear).toBe(false);
  expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  expect(renderer.xr.enabled).toBe(true);
  // The actual target is observed through the renderer adapter, without GPU mocks.
  const captureSize = () => (captured ? [captured.width, captured.height] : []);
  expect(captureSize()).toEqual([1536, 864]);
  expect(captured).not.toBeNull();
  unregisterA();
  unregisterB();
  capture.capture();
  expect(renders).toBe(1);
  capture.dispose();
  capture.dispose();
  original.dispose();
  expect(a.hasSceneColor.value).toBe(0);
  expect(a.sceneColor.value).toBeNull();
});
