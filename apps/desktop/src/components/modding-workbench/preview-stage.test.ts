import { afterAll, expect, mock, test } from "bun:test";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";

const three = await import("three");
const frames = new Map<number, FrameRequestCallback>();
const visibility = new EventTarget();
const documentState = {
  hidden: false,
  addEventListener: visibility.addEventListener.bind(visibility),
  removeEventListener: visibility.removeEventListener.bind(visibility),
  createElement: () => ({
    clientWidth: 256,
    clientHeight: 192,
    append: mock(),
  }),
};
const globals = new Map<string, PropertyDescriptor | undefined>();
function installGlobal<T>(name: string, value: T) {
  globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
let sequence = 0;
installGlobal("document", documentState);
installGlobal("window", { devicePixelRatio: 2 });
installGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
  const id = ++sequence;
  frames.set(id, callback);
  return id;
});
installGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
const Observer = class {
  observe() {}
  disconnect() {}
};
installGlobal("ResizeObserver", Observer);
installGlobal("IntersectionObserver", Observer);

const renderers: FakeRenderer[] = [];
class FakeFileReader extends EventTarget {
  result = "data:image/png;base64,thumbnail";
  readAsDataURL() {
    queueMicrotask(() => this.dispatchEvent(new Event("load")));
  }
}
installGlobal("FileReader", FakeFileReader);
class FakeRenderer {
  domElement = {
    toDataURL: mock(() => "data:image/png;base64,thumbnail"),
    toBlob: mock((callback: BlobCallback) =>
      queueMicrotask(() => callback(new Blob(["thumbnail"]))),
    ),
    remove: mock(),
  };
  outputColorSpace = "";
  render = mock();
  dispose = mock();
  forceContextLoss = mock();
  constructor() {
    renderers.push(this);
  }
  setPixelRatio() {}
  setSize() {}
}
mock.module("three", () => ({ ...three, WebGLRenderer: FakeRenderer }));
mock.module("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    target = new three.Vector3();
    enableDamping = false;
    enabled = true;
    addEventListener() {}
    update() {
      return false;
    }
    dispose() {}
  },
}));
mock.module("@/components/foundry/workbench-model-loader", () => ({
  loadPreviewModel: async () => ({
    scene: new three.Group(),
    source2Textures: new Map(),
    dispose: mock(),
  }),
}));
mock.module("@/lib/model-assets", () => ({
  retainFoundryModel: () => () => {},
  modelAssetUrl: () => "asset://model",
}));
const { PreviewStage } = await import("./preview-stage");

afterAll(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  mock.restore();
});

function graph(): FoundryParticleGraph {
  return {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    attachments: {},
    systems: {},
    models: [],
    materials: {},
    warnings: [],
    textures: [],
  };
}

async function settleAssets() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function drawFrame(now = performance.now()) {
  const next = frames.entries().next().value;
  if (!next) return;
  frames.delete(next[0]);
  next[1](now);
}

test("two preview stages share browser frames without starving either view", async () => {
  const first = new PreviewStage(document.createElement("div"));
  const second = new PreviewStage(document.createElement("div"));
  const views = renderers.slice(-2);
  first.setPlaying(false);
  second.setPlaying(false);
  first.setGraph(graph(), []);
  second.setGraph(graph(), []);
  await settleAssets();
  const now = performance.now();
  drawFrame(now);
  drawFrame(now);
  expect(
    views.reduce((sum, view) => sum + view.render.mock.calls.length, 0),
  ).toBe(1);
  expect(frames.size).toBe(1);
  drawFrame(now + 17);
  expect(views.map((view) => view.render.mock.calls.length)).toEqual([1, 1]);
  expect(frames.size).toBe(0);
  first.dispose();
  second.dispose();
});

test("disposing a queued preview releases the next browser frame", () => {
  const first = new PreviewStage(document.createElement("div"));
  const second = new PreviewStage(document.createElement("div"));
  const renderer = renderers.at(-2);
  first.setPlaying(false);
  second.setPlaying(false);
  const now = performance.now();
  drawFrame(now);
  drawFrame(now);
  second.dispose();
  first.invalidate();
  drawFrame(now + 17);
  expect(renderer?.render).toHaveBeenCalledTimes(2);
  expect(frames.size).toBe(0);
  first.dispose();
});

test("draft changes keep the renderer and paused scenes stop requesting frames", async () => {
  const stage = new PreviewStage(document.createElement("div"));
  const renderer = renderers.at(-1);
  const count = renderers.length;
  stage.setPlaying(false);
  stage.setGraph(graph(), []);
  await settleAssets();
  drawFrame();
  expect(frames.size).toBe(0);
  const position = stage.camera.position.clone();
  stage.camera.position.set(8, 6, 4);
  stage.setGraph(graph(), []);
  await settleAssets();
  drawFrame();
  expect(renderers.length).toBe(count);
  expect(renderer?.dispose).not.toHaveBeenCalled();
  expect(stage.camera.position.toArray()).toEqual([8, 6, 4]);
  expect(stage.camera.position.equals(position)).toBe(false);
  expect(frames.size).toBe(0);
  stage.dispose();
  expect(renderer?.dispose).toHaveBeenCalledTimes(1);
  expect(renderer?.forceContextLoss).toHaveBeenCalledTimes(1);
});

test("thumbnail simulation reaches its capture time without waiting for wall time", async () => {
  const stage = new PreviewStage(document.createElement("div"), true);
  const snapshot = mock();
  stage.callbacks = { snapshot };
  stage.setGraph(graph(), []);
  await settleAssets();
  const sameTime = performance.now();
  for (let frame = 0; frame < 12 && frames.size; frame++) drawFrame(sameTime);
  await settleAssets();
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(snapshot).toHaveBeenCalledWith("data:image/png;base64,thumbnail");
  expect(frames.size).toBe(0);
  expect(renderers.at(-1)?.domElement.toDataURL).not.toHaveBeenCalled();
  stage.dispose();
});

test("hidden scenes sleep and resume after visibility changes", async () => {
  const stage = new PreviewStage(document.createElement("div"));
  const renderer = renderers.at(-1);
  stage.setGraph(graph(), []);
  await settleAssets();
  documentState.hidden = true;
  drawFrame();
  expect(renderer?.render).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  documentState.hidden = false;
  visibility.dispatchEvent(new Event("visibilitychange"));
  drawFrame();
  expect(renderer?.render).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(1);
  stage.setPlaying(false);
  drawFrame();
  expect(frames.size).toBe(0);
  stage.dispose();
});

test("a thumbnail capture arriving after its task changes is discarded", async () => {
  const stage = new PreviewStage(document.createElement("div"), true);
  const snapshot = mock();
  stage.callbacks = { snapshot };
  stage.setGraph(graph(), []);
  await settleAssets();
  for (let frame = 0; frame < 12 && frames.size; frame++) drawFrame();
  stage.clear();
  await settleAssets();
  expect(snapshot).not.toHaveBeenCalled();
  stage.dispose();
});
