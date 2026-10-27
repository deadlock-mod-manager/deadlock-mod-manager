import { expect, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";
import { particleMaterial, SPRITE_VERTEX } from "./particle-material";

const assetsForTest = () => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    attachments: {},
    textures: [],
    models: [],
    materials: {},
    warnings: [],
  };
  const assets = new ParticleAssets(graph, []);
  assets.textures.set("smoke", {
    texture: new THREE.Texture(),
    sheet: { path: "smoke", dataUrl: "", sequences: [] },
  });
  return assets;
};

test("preserves authored half-additive coverage rather than treating every ADD suffix as additive", () => {
  const assets = assetsForTest();
  const half = particleMaterial(
    {
      m_hTexture: "smoke",
      m_nOutputBlendMode: "PARTICLE_OUTPUT_BLEND_MODE_HALF_BLEND_ADD",
    },
    assets,
    SPRITE_VERTEX,
  );
  const add = particleMaterial(
    {
      m_hTexture: "smoke",
      m_nOutputBlendMode: "PARTICLE_OUTPUT_BLEND_MODE_ADD",
    },
    assets,
    SPRITE_VERTEX,
  );
  expect(half?.uniforms.outputAlphaFactor.value).toBe(0.5);
  expect(add?.uniforms.outputAlphaFactor.value).toBe(0);
  expect(half?.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
  half?.dispose();
  add?.dispose();
  assets.dispose();
});

test("uses destination modulation and maximum blending for the corresponding authored modes", () => {
  const assets = assetsForTest();
  const mod = particleMaterial(
    {
      m_hTexture: "smoke",
      m_nOutputBlendMode: "PARTICLE_OUTPUT_BLEND_MODE_MOD2X",
    },
    assets,
    SPRITE_VERTEX,
  );
  const lighten = particleMaterial(
    {
      m_hTexture: "smoke",
      m_nOutputBlendMode: "PARTICLE_OUTPUT_BLEND_MODE_LIGHTEN",
    },
    assets,
    SPRITE_VERTEX,
  );
  expect(mod?.blendSrc).toBe(THREE.DstColorFactor);
  expect(mod?.blendDst).toBe(THREE.SrcColorFactor);
  expect(lighten?.blendEquation).toBe(THREE.MaxEquation);
  mod?.dispose();
  lighten?.dispose();
  assets.dispose();
});

test("reports unavailable layer rendering instead of silently pretending it is supported", () => {
  const assets = assetsForTest();
  const material = particleMaterial(
    {
      m_hTexture: "smoke",
      m_vecTexturesInput: [
        { m_hTexture: "smoke" },
        {
          m_hTexture: "flow",
          m_nTextureType: "SPRITECARD_TEXTURE_ANIMMOTIONVEC",
        },
      ],
    },
    assets,
    SPRITE_VERTEX,
  );
  expect([...assets.warnings]).toContain(
    "Unsupported particle texture layer: SPRITECARD_TEXTURE_ANIMMOTIONVEC",
  );
  material?.dispose();
  assets.dispose();
});
