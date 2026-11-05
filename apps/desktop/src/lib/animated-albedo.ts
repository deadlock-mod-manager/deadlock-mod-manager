import { Mesh, Vector2, type Material, type Object3D } from "three";
import { z } from "zod";
import { addMaterialShaderHook } from "./material-shader-hooks";
import { modelPaintFrameAt } from "./model-paint-animation";

const uv = z.tuple([z.number().finite(), z.number().finite()]);
const animationSchema = z
  .object({
    scale: uv,
    offsets: z.array(uv).min(2).max(128),
    durationsMs: z.array(z.number().positive().finite()).min(2).max(128),
    plays: z.literal(0),
  })
  .refine(
    (animation) => animation.offsets.length === animation.durationsMs.length,
  );
const metadata = z.object({
  source2Effect: z.object({ animatedAlbedo: animationSchema }),
});

export function installAnimatedAlbedo(root: Object3D, editing = false) {
  const seen = new Set<Material>();
  const updates: ((seconds: number) => void)[] = [];
  const disposers: (() => void)[] = [];
  if (!editing)
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (seen.has(material)) continue;
        seen.add(material);
        const parsed = metadata.safeParse(material.userData);
        if (!parsed.success) continue;
        const animation = parsed.data.source2Effect.animatedAlbedo;
        const offset = { value: new Vector2(...animation.offsets[0]) };
        const scale = { value: new Vector2(...animation.scale) };
        const timeline = {
          plays: 0,
          frames: animation.durationsMs.map((durationMs) => ({ durationMs })),
        };
        let previous = -1;
        disposers.push(
          addMaterialShaderHook(
            material,
            "dmm-animated-albedo-v1",
            (shader) => {
              shader.uniforms.uDmmAtlasScale = scale;
              shader.uniforms.uDmmAtlasOffset = offset;
              shader.vertexShader =
                `uniform vec2 uDmmAtlasScale;\nuniform vec2 uDmmAtlasOffset;\n${shader.vertexShader}`.replace(
                  "#include <uv_vertex>",
                  "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * uDmmAtlasScale + uDmmAtlasOffset;\n#endif",
                );
            },
          ),
        );
        updates.push((seconds) => {
          const index = modelPaintFrameAt(timeline, seconds);
          if (index === previous) return;
          previous = index;
          offset.value.set(...animation.offsets[index]);
        });
      }
    });
  return {
    active: updates.length > 0,
    update(seconds: number) {
      for (const update of updates) update(seconds);
    },
    dispose() {
      let dispose = disposers.pop();
      while (dispose) {
        dispose();
        dispose = disposers.pop();
      }
    },
  };
}
