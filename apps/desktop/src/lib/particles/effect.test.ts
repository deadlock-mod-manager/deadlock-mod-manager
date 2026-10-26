import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import type { PreviewParticleSystem } from "@/types/generated/PreviewParticleSystem";
import { compileParticleEffects, createParticleEffect } from "./effect";

const file = (
  path: string,
  children: PreviewParticleSystem[] = [],
): PreviewParticleSystem => ({
  path,
  definition: "{}",
  children,
});
const count = (
  systems: { children: ReturnType<typeof compileParticleEffects>["roots"] }[],
): number =>
  systems.reduce((total, system) => total + 1 + count(system.children), 0);

test("the frontend also caps the combined roots and descendants", () => {
  const result = compileParticleEffects({
    attachments: [],
    textures: [],
    systems: Array.from({ length: 30 }, (_, index) =>
      file(`root${index}`, [file(`child${index}`)]),
    ),
  });
  expect(count(result.roots)).toBe(48);
  expect(
    result.diagnostics.some((diagnostic) => diagnostic.code === "system-limit"),
  ).toBe(true);
});

test("malformed roots do not hide healthy systems and missing textures are reported", () => {
  const result = compileParticleEffects({
    attachments: [],
    textures: [],
    systems: [
      { path: "bad", definition: "{", children: [] },
      {
        path: "healthy",
        definition: JSON.stringify({
          m_Renderers: [
            { _class: "C_OP_RenderSprites", m_hTexture: "missing.vtex" },
          ],
        }),
        children: [],
      },
    ],
  });
  expect(result.roots.map((root) => root.path)).toEqual(["healthy"]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "invalid-definition",
    "missing-texture",
  ]);
});

const spriteDefinition = (texturePath: string) =>
  JSON.stringify({
    m_nMaxParticles: 2,
    m_Emitters: [
      { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
    ],
    m_Renderers: [{ _class: "C_OP_RenderSprites", m_hTexture: texturePath }],
  });

test("blocked parents retain healthy children and release shared render resources once", () => {
  const texture = new THREE.Texture<HTMLImageElement>();
  const load = spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(
    () => texture,
  );
  let textureDisposals = 0;
  texture.addEventListener("dispose", () => {
    textureDisposals += 1;
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const model = new THREE.Group();
  const diagnostics: string[] = [];
  try {
    const effect = createParticleEffect(
      {
        attachments: [],
        systems: [
          {
            path: "blocked",
            definition: JSON.stringify({
              m_Initializers: [{ _class: "C_INIT_CreateOnModel" }],
              m_Renderers: [
                { _class: "C_OP_RenderSprites", m_hTexture: "blocked.vtex" },
              ],
            }),
            children: [
              {
                path: "healthy",
                definition: spriteDefinition("used.vtex"),
                children: [],
              },
            ],
          },
        ],
        textures: ["used.vtex", "used.vtex", "blocked.vtex", "unused.vtex"].map(
          (path) => ({
            path,
            dataUrl: "data:image/png;base64,",
            sequences: [],
          }),
        ),
      },
      {
        onDiagnostics: (entries) => {
          diagnostics.push(...entries.map((entry) => entry.code));
        },
      },
    )({ scene, camera, model });
    if (!effect) throw new Error("Expected a particle effect");
    expect(diagnostics).toEqual(["blocked"]);
    expect(load).toHaveBeenCalledTimes(1);
    const group = scene.children[0];
    expect(group.children).toHaveLength(1);
    const mesh = group.children[0];
    if (
      !(mesh instanceof THREE.Mesh) ||
      !(mesh.geometry instanceof THREE.InstancedBufferGeometry) ||
      !(mesh.material instanceof THREE.ShaderMaterial)
    )
      throw new Error("Expected a sprite mesh");
    expect(mesh.geometry.instanceCount).toBe(0);
    let geometryDisposals = 0;
    let materialDisposals = 0;
    mesh.geometry.addEventListener("dispose", () => {
      geometryDisposals += 1;
    });
    mesh.material.addEventListener("dispose", () => {
      materialDisposals += 1;
    });
    effect.update(0);
    expect(mesh.geometry.instanceCount).toBe(1);
    effect.reset();
    effect.update(0);
    expect(mesh.geometry.instanceCount).toBe(1);
    effect.dispose();
    effect.dispose();
    effect.reset();
    effect.update(0.1);
    expect(scene.children).toHaveLength(0);
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
    expect(textureDisposals).toBe(1);
  } finally {
    load.mockRestore();
  }
});

test("particle and drawable budgets are shared by every root", () => {
  const result = compileParticleEffects({
    attachments: [],
    textures: [],
    systems: Array.from({ length: 48 }, (_, index) => ({
      path: `root${index}`,
      children: [],
      definition: JSON.stringify({
        m_nMaxParticles: 400,
        m_Emitters: [{ _class: "C_OP_InstantaneousEmitter" }],
        m_Renderers: Array.from({ length: 20 }, () => ({
          _class: "C_OP_RenderSprites",
        })),
      }),
    })),
  });
  const playable = result.roots.filter((root) => !root.blockedBy);
  expect(playable.reduce((sum, root) => sum + root.maxParticles, 0)).toBe(4096);
  expect(playable.reduce((sum, root) => sum + root.renderers.length, 0)).toBe(
    96,
  );
  expect(
    result.diagnostics.some((entry) => entry.detail === "particle-budget"),
  ).toBe(true);
  expect(
    result.diagnostics.some((entry) => entry.detail === "drawable-budget"),
  ).toBe(true);
});

test("late texture completions release images and failures cannot notify a disposed effect", () => {
  const texture = new THREE.Texture<HTMLImageElement>();
  let complete: Parameters<THREE.TextureLoader["load"]>[1];
  let fail: Parameters<THREE.TextureLoader["load"]>[3];
  const load = spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(
    (_url, onLoad, _progress, onError) => {
      complete = onLoad;
      fail = onError;
      return texture;
    },
  );
  let reports = 0;
  let disposals = 0;
  texture.addEventListener("dispose", () => {
    disposals += 1;
  });
  try {
    const effect = createParticleEffect(
      {
        attachments: [],
        systems: [
          {
            path: "effect",
            definition: spriteDefinition("used.vtex"),
            children: [],
          },
        ],
        textures: [
          {
            path: "used.vtex",
            dataUrl: "data:image/png;base64,",
            sequences: [],
          },
        ],
      },
      {
        onDiagnostics: () => {
          reports += 1;
        },
      },
    )({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      model: new THREE.Group(),
    });
    if (!effect) throw new Error("Expected an effect");
    fail?.(new Error("image decode failed"));
    expect(reports).toBe(2);
    effect.dispose();
    complete?.(texture);
    fail?.(new Error("late failure"));
    expect(texture.image).toBeNull();
    expect(disposals).toBe(2);
    expect(reports).toBe(2);
  } finally {
    load.mockRestore();
  }
});

const attachmentDrivers = (name: string) => ({
  m_controlPointConfigurations: [
    {
      m_name: "preview",
      m_drivers: [
        {
          m_iControlPoint: 0,
          m_iAttachType: "PATTACH_POINT_FOLLOW",
          m_attachmentName: name,
        },
      ],
    },
  ],
});

test("missing root drivers skip only their shared tree while valid attachments still position particles", () => {
  const scene = new THREE.Scene();
  const model = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "book_main";
  bone.position.set(2, 3, 4);
  model.add(bone);
  const definition = {
    m_nMaxParticles: 2,
    m_Emitters: [{ _class: "C_OP_InstantaneousEmitter" }],
    m_Renderers: [{ _class: "C_OP_RenderSprites" }],
  };
  const make = (
    path: string,
    name: string,
    children: PreviewParticleSystem[] = [],
  ): PreviewParticleSystem => ({
    path,
    children,
    definition: JSON.stringify({ ...definition, ...attachmentDrivers(name) }),
  });
  const codes: string[] = [];
  const effect = createParticleEffect(
    {
      attachments: [
        {
          name: "book_fx",
          bone: "book_main",
          offset: [1, 0, 0],
          rotation: [0, 0, 0, 1],
        },
      ],
      textures: [],
      systems: [
        make("invalid", "missing", [make("child", "book_fx")]),
        make("valid", "book_fx"),
      ],
    },
    {
      onDiagnostics: (diagnostics) => {
        codes.push(...diagnostics.map((entry) => entry.code));
      },
    },
  )({ scene, camera: new THREE.PerspectiveCamera(), model });
  if (!effect) throw new Error("Expected an effect");
  try {
    expect(codes).toEqual(["missing-attachment"]);
    expect(scene.children[0].children).toHaveLength(1);
    effect.update(0);
    const mesh = scene.children[0].children[0];
    if (!(mesh instanceof THREE.Mesh)) throw new Error("Expected a sprite");
    const position = mesh.geometry.getAttribute("iPosition");
    const sourcePosition = new THREE.Vector3(
      position.getX(0),
      position.getY(0),
      position.getZ(0),
    );
    mesh.localToWorld(sourcePosition);
    expect(sourcePosition.x).toBeCloseTo(3);
    expect(sourcePosition.y).toBeCloseTo(3);
    expect(sourcePosition.z).toBeCloseTo(4);
  } finally {
    effect.dispose();
  }
});
