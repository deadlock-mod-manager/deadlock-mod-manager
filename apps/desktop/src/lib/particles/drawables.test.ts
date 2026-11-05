import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import { compileRenderer } from "./renderers";
import { STATIC_CONTEXT } from "./compile-values";
import { curvePoint, particleDrawOrder, trailLength } from "./drawables";
import {
  createParticleEffect,
  particleModelPaths,
  type ParticlePreviewControls,
} from "./effect";

const context = () => ({
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  model: new THREE.Group(),
});
const dataFor = (renderer: string, extra = {}) => ({
  attachments: [],
  textures: [],
  systems: [
    {
      path: "effect",
      children: [],
      definition: JSON.stringify({
        m_nMaxParticles: 4,
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 2 },
        ],
        m_Renderers: [{ _class: renderer, ...extra }],
      }),
    },
  ],
});

const firstMesh = (scene: THREE.Scene) => {
  const mesh = scene.children[0]?.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error("Expected particle mesh");
  return mesh;
};

test("trails compile separately with authored length, tail, UV and blend inputs", () => {
  const spec = compileRenderer({
    _class: "C_OP_RenderTrails",
    m_flMinLength: 2,
    m_flMaxLength: 20,
    m_flLengthScale: 0.5,
    m_bFadeOut: false,
    m_vecUVScale: [2, 3],
    m_vecUVOffset: [0.25, 0.5],
    m_nOutputBlendMode: "PARTICLE_OUTPUT_BLEND_MODE_MULTIPLY",
  });
  expect(spec?.kind).toBe("trails");
  expect(spec?.minLength.evaluate(STATIC_CONTEXT)).toBe(2);
  expect(spec?.maxLength.evaluate(STATIC_CONTEXT)).toBe(20);
  expect(spec?.tailFade).toBe(false);
  expect(spec?.blend).toBe("multiply");
  expect(spec?.uvScale).toEqual([2, 3]);
  expect(trailLength(100, 0.1, 0.5, 2, 20, 1, 1)).toBe(5);
  expect(trailLength(100, 1, 0.5, 2, 20, 1, 1)).toBe(20);
  expect(trailLength(0, 1, 0.5, 2, 20)).toBe(2);
});

test("one frame prepares once after many simulation steps and paused frames retain buffers", () => {
  const view = context();
  const effect = createParticleEffect(dataFor("C_OP_RenderSprites"), {
    prewarm: false,
  })(view);
  if (!effect) throw new Error("Expected effect");
  const mesh = firstMesh(view.scene);
  const attribute = mesh.geometry.getAttribute("iPosition");
  if (!(attribute instanceof THREE.BufferAttribute))
    throw new Error("Expected buffer attribute");
  for (let index = 0; index < 8; index += 1) effect.update(1 / 120);
  expect(attribute.version).toBe(0);
  effect.prepare?.();
  expect(attribute.version).toBe(1);
  effect.update(0);
  effect.prepare?.();
  expect(attribute.version).toBe(1);
  effect.dispose();
});

test("trails are independent stretched instances and ropes are interpolated connected ribbons", () => {
  for (const kind of ["C_OP_RenderTrails", "C_OP_RenderRopes"]) {
    const view = context();
    const effect = createParticleEffect(dataFor(kind), { prewarm: false })(
      view,
    );
    if (!effect) throw new Error("Expected effect");
    effect.update(1 / 60);
    effect.prepare?.();
    const mesh = firstMesh(view.scene);
    if (kind === "C_OP_RenderTrails") {
      expect(mesh.geometry instanceof THREE.InstancedBufferGeometry).toBe(true);
      expect(mesh.geometry.getAttribute("iVelocityLength").count).toBe(4);
      if (!(mesh.material instanceof THREE.ShaderMaterial))
        throw new Error("Expected shader");
      expect(mesh.material.uniforms.trail.value).toBe(1);
    } else {
      expect(mesh.geometry instanceof THREE.InstancedBufferGeometry).toBe(
        false,
      );
      expect(mesh.geometry.drawRange.count).toBe(18);
      expect(mesh.geometry.hasAttribute("tangent")).toBe(true);
    }
    effect.dispose();
  }
  expect(curvePoint(0, 2, 5, 8, 0)).toBe(2);
  expect(curvePoint(0, 2, 5, 8, 1)).toBe(5);
});

test("alpha sorting uses camera depth, remains stable for ties, and keeps simulation storage unchanged", () => {
  const positions = new Float32Array([0, 0, -1, 0, 0, -5, 0, 0, -5, 0, 0, -3]);
  const original = positions.slice();
  expect(
    particleDrawOrder(4, positions, new THREE.Matrix4(), true, []),
  ).toEqual([1, 2, 3, 0]);
  expect(
    particleDrawOrder(
      4,
      positions,
      new THREE.Matrix4().makeRotationY(Math.PI),
      true,
      [],
    ),
  ).toEqual([0, 3, 1, 2]);
  expect(
    particleDrawOrder(4, positions, new THREE.Matrix4(), false, []),
  ).toEqual([0, 1, 2, 3]);
  expect(positions).toEqual(original);
});

test("model renderer uses supplied referenced geometry and retains caller-owned materials", () => {
  const source = new THREE.Mesh(
    new THREE.BoxGeometry(2, 3, 4),
    new THREE.MeshStandardMaterial(),
  );
  const asset = new THREE.Group();
  asset.add(source);
  let sourceDisposals = 0;
  source.material.addEventListener("dispose", () => {
    sourceDisposals += 1;
  });
  const data = dataFor("C_OP_RenderModels", {
    m_modelList: [{ m_model: "models/projectile.vmdl" }],
  });
  expect(particleModelPaths(data)).toEqual(["models/projectile.vmdl"]);
  const view = context();
  const effect = createParticleEffect(data, {
    prewarm: false,
    modelAssets: new Map([["models/projectile.vmdl", asset]]),
  })(view);
  if (!effect) throw new Error("Expected effect");
  effect.update(1 / 60);
  effect.prepare?.();
  const mesh = firstMesh(view.scene);
  expect(mesh instanceof THREE.InstancedMesh).toBe(true);
  expect(mesh.geometry.getAttribute("position").count).toBe(
    source.geometry.getAttribute("position").count,
  );
  expect(mesh.geometry).not.toBe(source.geometry);
  effect.dispose();
  expect(sourceDisposals).toBe(0);
  source.geometry.dispose();
  source.material.dispose();
});

test("renderer endcap visibility follows release and controls isolate without altering other systems", () => {
  const view = context();
  const data = dataFor("C_OP_RenderSprites", {
    m_nOpEndCapState: "PARTICLE_ENDCAP_ENDCAP_ON",
  });
  const effect = createParticleEffect(data, { prewarm: false })(view);
  if (!effect) throw new Error("Expected effect");
  effect.update(1 / 60);
  effect.prepare?.();
  expect(firstMesh(view.scene).visible).toBe(false);
  effect.release?.();
  effect.prepare?.();
  expect(firstMesh(view.scene).visible).toBe(true);
  effect.dispose();
});

test("manual release preserves its recorded clock boundary through reset and seek", () => {
  const view = context();
  const controls: ParticlePreviewControls = {
    charge: 1,
    released: true,
    releaseTime: 0.025,
    target: [0, 0, 0],
    markers: false,
    isolatedPath: null,
  };
  const effect = createParticleEffect(
    dataFor("C_OP_RenderSprites", {
      m_nOpEndCapState: "PARTICLE_ENDCAP_ENDCAP_ON",
    }),
    { prewarm: false, controls: () => controls },
  )(view);
  if (!effect) throw new Error("Expected effect");
  for (let replay = 0; replay < 2; replay += 1) {
    effect.reset();
    effect.prepare?.();
    expect(firstMesh(view.scene).visible).toBe(false);
    effect.update(1 / 60);
    effect.prepare?.();
    expect(firstMesh(view.scene).visible).toBe(false);
    effect.update(1 / 60);
    effect.prepare?.();
    expect(firstMesh(view.scene).visible).toBe(true);
  }
  effect.dispose();
});

test("preview target transforms and charge bindings reach the same per-system input context", () => {
  const view = context();
  view.model.position.set(1, 2, 3);
  const data = dataFor("C_OP_RenderSprites", {
    m_flRadiusScale: {
      m_nType: "PF_TYPE_CONTROL_POINT_COMPONENT",
      m_nControlPoint: 1,
      m_nVectorComponent: 0,
    },
  });
  data.systems[0].definition = JSON.stringify({
    m_nMaxParticles: 2,
    m_Emitters: [{ _class: "C_OP_InstantaneousEmitter" }],
    m_Initializers: [
      { _class: "C_INIT_CreateWithinSphere", m_nControlPointNumber: 10 },
    ],
    m_Renderers: [
      {
        _class: "C_OP_RenderSprites",
        m_flRadiusScale: {
          m_nType: "PF_TYPE_CONTROL_POINT_COMPONENT",
          m_nControlPoint: 1,
          m_nVectorComponent: 0,
        },
      },
    ],
  });
  const effect = createParticleEffect(data, {
    prewarm: false,
    controls: () => ({
      charge: 0.5,
      released: false,
      target: [2, 3, 4],
      markers: false,
      isolatedPath: null,
    }),
  })(view);
  if (!effect) throw new Error("Expected effect");
  effect.update(1 / 60);
  effect.prepare?.();
  const mesh = firstMesh(view.scene);
  const position = mesh.geometry.getAttribute("iPosition");
  const world = mesh.localToWorld(
    new THREE.Vector3(position.getX(0), position.getY(0), position.getZ(0)),
  );
  expect(world.x).toBeCloseTo(3);
  expect(world.y).toBeCloseTo(5);
  expect(world.z).toBeCloseTo(7);
  expect(mesh.geometry.getAttribute("iSizeRoll").getX(0)).toBeCloseTo(2.5);
  effect.dispose();
});

test("atlas durations, data masks and material time retain their authored domains", () => {
  const texture = new THREE.Texture<HTMLImageElement>();
  const load = spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(
    () => texture,
  );
  const data: Parameters<typeof createParticleEffect>[0] = {
    ...dataFor("C_OP_RenderSprites", {
      m_vecTexturesInput: [
        { m_hTexture: "atlas" },
        {
          m_hTexture: "atlas",
          m_nTextureBlendMode: "SPRITECARD_TEXTURE_BLEND_MULTIPLY",
        },
      ],
    }),
    textures: [
      {
        path: "atlas",
        dataUrl: "data:image/png;base64,",
        width: 128,
        height: 64,
        sequences: [
          {
            framesPerSecond: 10,
            frames: [
              { duration: 0.1, min: [0, 0], max: [0.5, 1] },
              { duration: 0.3, min: [0.5, 0], max: [1, 1] },
            ],
          },
        ],
      },
    ],
  };
  try {
    const view = context();
    const effect = createParticleEffect(data, { prewarm: false })(view);
    if (!effect) throw new Error("Expected effect");
    const mesh = firstMesh(view.scene);
    if (!(mesh.material instanceof THREE.ShaderMaterial))
      throw new Error("Expected particle shader");
    const map = mesh.material.uniforms.map.value,
      mask = mesh.material.uniforms.mask.value,
      frames = mesh.material.uniforms.frames.value;
    if (
      !(map instanceof THREE.Texture) ||
      !(mask instanceof THREE.Texture) ||
      !(frames instanceof THREE.DataTexture)
    )
      throw new Error("Expected textures");
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mask.colorSpace).toBe(THREE.NoColorSpace);
    expect(mask.source).toBe(map.source);
    const frameData = frames.image.data;
    if (!frameData) throw new Error("Expected frame metadata");
    expect(frameData[8]).toBeCloseTo(0.1);
    expect(frameData[12]).toBeCloseTo(0.4);
    effect.update(1 / 60);
    effect.prepare?.();
    expect(mesh.material.uniforms.time.value).toBeCloseTo(1 / 60);
    effect.prepare?.();
    expect(mesh.material.uniforms.time.value).toBeCloseTo(1 / 60);
    effect.reset();
    effect.prepare?.();
    expect(mesh.material.uniforms.time.value).toBe(0);
    effect.dispose();
  } finally {
    load.mockRestore();
  }
});
