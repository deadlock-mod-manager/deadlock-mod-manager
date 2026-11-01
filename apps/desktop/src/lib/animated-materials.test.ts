import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import { installAnimatedMaterials, materialFamily } from "./animated-materials";
import { addMaterialShaderHook } from "./material-shader-hooks";

function sceneWithEffect(materialPath: string) {
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2Effect = {
    shader: "citadel_effects.vfx",
    material: materialPath,
    floats: { g_flOpacityScale: 0.6 },
    vectors: { g_vAlbedoScrollSpeed: [0.25, -0.5, 0, 0] },
    flags: { F_ADDITIVE_BLEND: 1 },
    textures: {},
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  return { material, mesh };
}

describe("animated material previews", () => {
  it("keeps inert surface materials on the unmodified shader path", async () => {
    const { material, mesh } = sceneWithEffect(
      "models/heroes/haze/body.vmat_c",
    );
    material.userData.source2Effect.floats = {
      g_flOpacityScale1: 1,
      g_flAlbedoTexcoordRotation1: 0,
    };
    material.userData.source2Effect.vectors = {
      g_vAlbedoScrollSpeed1: [0, 0, 0, 0],
    };
    material.userData.source2Effect.flags = {};
    material.userData.source2Effect.maskTexture = 1;
    const original = material.onBeforeCompile;
    let loads = 0;
    const preview = await installAnimatedMaterials(mesh, async () => {
      loads += 1;
      return new THREE.Texture();
    });
    expect(material.onBeforeCompile).toBe(original);
    expect(loads).toBe(0);
    preview.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });
  it("disables disposed hooks below another feature and invalidates its program key", () => {
    const material = new THREE.MeshStandardMaterial();
    material.customProgramCacheKey = () => "base";
    const removeFirst = addMaterialShaderHook(
      material,
      "animated",
      (shader) => {
        shader.fragmentShader += " animated";
      },
    );
    const removeSecond = addMaterialShaderHook(material, "paint", (shader) => {
      shader.fragmentShader += " paint";
    });
    const previousKey = material.customProgramCacheKey();
    removeFirst();
    const shader = { vertexShader: "", fragmentShader: "", uniforms: {} };
    // Source-only callback verification does not need a renderer or WebGL context.
    // oxlint-disable-next-line anti-slop/no-reflect-apply
    Reflect.apply(material.onBeforeCompile, material, [shader]);
    expect(shader.fragmentShader).toBe(" paint");
    expect(material.customProgramCacheKey()).not.toBe(previousKey);
    expect(material.customProgramCacheKey()).toContain("animated:disposed");
    removeSecond();
    material.dispose();
  });
  it("deduplicates extra mask loads and closes owned images once", async () => {
    const previousImageBitmap = globalThis.ImageBitmap;
    class Bitmap implements ImageBitmap {
      width = 1;
      height = 1;
      closes = 0;
      close() {
        this.closes += 1;
      }
    }
    globalThis.ImageBitmap = Bitmap;
    try {
      const first = sceneWithEffect("materials/lash/lash_sparkles.vmat_c");
      const second = sceneWithEffect("materials/lash/lash_sparkles.vmat_c");
      first.material.userData.source2Effect.maskTexture = 1;
      second.material.userData.source2Effect.maskTexture = 1;
      const root = new THREE.Group();
      root.add(first.mesh, second.mesh);
      const image = new Bitmap();
      const original = new THREE.Texture(image);
      let loads = 0;
      let disposes = 0;
      original.addEventListener("dispose", () => {
        disposes += 1;
      });
      const preview = await installAnimatedMaterials(root, async () => {
        loads += 1;
        return original;
      });
      expect(loads).toBe(1);
      preview.dispose();
      preview.dispose();
      expect(disposes).toBe(1);
      expect(image.closes).toBe(1);
      first.mesh.geometry.dispose();
      second.mesh.geometry.dispose();
      first.material.dispose();
      second.material.dispose();
    } finally {
      globalThis.ImageBitmap = previousImageBitmap;
    }
  });

  it("leaves borrowed material maps and shared images alive", async () => {
    const previousImageBitmap = globalThis.ImageBitmap;
    class Bitmap implements ImageBitmap {
      width = 1;
      height = 1;
      closes = 0;
      close() {
        this.closes += 1;
      }
    }
    globalThis.ImageBitmap = Bitmap;
    try {
      const { material, mesh } = sceneWithEffect(
        "materials/lash/lash_sparkles.vmat_c",
      );
      const image = new Bitmap();
      const original = new THREE.Texture(image);
      material.map = original;
      material.userData.source2Effect.maskTexture = 1;
      let disposes = 0;
      original.addEventListener("dispose", () => {
        disposes += 1;
      });
      const preview = await installAnimatedMaterials(
        mesh,
        async () => original,
      );
      preview.dispose();
      expect(disposes).toBe(0);
      expect(image.closes).toBe(0);
      original.dispose();
      image.close();
      mesh.geometry.dispose();
      material.dispose();
    } finally {
      globalThis.ImageBitmap = previousImageBitmap;
    }
  });
  it("limits hero-specific shader families to their effect surfaces", () => {
    expect(
      materialFamily({
        shader: "pbr.vfx",
        material: "materials/infernus/body.vmat_c",
      }),
    ).toBe("surface");
    expect(
      materialFamily({
        shader: "citadel_effects.vfx",
        material: "materials/infernus/flame_hair.vmat_c",
      }),
    ).toBe("flame");
    expect(
      materialFamily({
        shader: "pbr.vfx",
        material: "materials/lash/lash_sparkles.vmat_c",
      }),
    ).toBe("sparkle");
    expect(
      materialFamily({
        shader: "pbr.vfx",
        material: "materials/viscous/viscous_glass.vmat_c",
      }),
    ).toBe("slime");
    expect(
      materialFamily({
        shader: "pbr.vfx",
        material: "models/heroes_staging/haze/materials/haze_body_smoke.vmat_c",
      }),
    ).toBe("surface");
    expect(
      materialFamily({
        shader: "pbr.vfx",
        material: "models/heroes_staging/haze/materials/haze_ui_smoke.vmat_c",
      }),
    ).toBe("smoke");
  });

  it("composes existing shader hooks and restores material state on disposal", async () => {
    const { material, mesh } = sceneWithEffect(
      "materials/lash/lash_sparkles.vmat_c",
    );
    const previous = material.onBeforeCompile;
    material.customProgramCacheKey = () => "paint-highlight";
    const preview = await installAnimatedMaterials(mesh);
    expect(material.customProgramCacheKey()).toBe(
      "paint-highlight|source2-effect-v1:sparkle:static:active",
    );
    expect(material.onBeforeCompile).not.toBe(previous);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    preview.update(8);
    preview.update(2);
    preview.dispose();
    expect(material.onBeforeCompile).toBe(previous);
    expect(material.customProgramCacheKey()).toBe("paint-highlight");
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.depthWrite).toBe(true);
    preview.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });

  it("reports malformed external material metadata without installing a hook", async () => {
    const { material, mesh } = sceneWithEffect("flame");
    material.userData.source2Effect = { shader: "broken" };
    const previous = material.onBeforeCompile;
    const preview = await installAnimatedMaterials(mesh);
    expect(preview.diagnostics).toHaveLength(1);
    expect(material.onBeforeCompile).toBe(previous);
    preview.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });

  it("binds shader time to playback time for pause, backwards seeks and reset", async () => {
    const { material, mesh } = sceneWithEffect(
      "materials/infernus/flame_hair.vmat_c",
    );
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader += "\n// highlight-hook";
    };
    const preview = await installAnimatedMaterials(mesh);
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    // Three's compile callback also accepts a live renderer; this hook only reads shader source.
    // oxlint-disable-next-line anti-slop/no-reflect-apply
    Reflect.apply(material.onBeforeCompile, material, [shader]);
    expect(shader.fragmentShader).toContain("highlight-hook");
    expect(shader.vertexShader).toContain("vMapUv = sourceTransform");
    expect(shader.fragmentShader).toContain("uSourceMask");
    for (const time of [8, 8, 2, 0]) {
      preview.update(time);
      expect(shader.uniforms).toMatchObject({ uSourceTime: { value: time } });
    }
    preview.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });
});
