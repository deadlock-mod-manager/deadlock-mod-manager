import { object, list, numberOf, stringOf, classOf } from "./definition";
import { parseFloatInput, parseVectorInput } from "./inputs";
import { STATIC_CONTEXT } from "./compile-values";
import { FIELD, type SpriteRendererSpec } from "./types";
import { type JsonObject } from "./json";

export const compileRenderer = (
  operator: JsonObject,
): SpriteRendererSpec | null => {
  const kind =
    classOf(operator) === "C_OP_RenderSprites"
      ? "sprites"
      : classOf(operator) === "C_OP_RenderRopes" ||
          classOf(operator) === "C_OP_RenderTrails"
        ? "ropes"
        : null;
  if (!kind) return null;
  const layers = list(operator.m_vecTexturesInput);
  const texture =
    stringOf(layers[0]?.m_hTexture, "") ||
    stringOf(operator.m_hTexture, "") ||
    null;
  // Spritecard layers past the first multiply by default; distortion and
  // other special layers are skipped.
  const mask =
    stringOf(
      layers
        .slice(1)
        .find(
          (layer) =>
            stringOf(
              layer.m_nTextureBlendMode,
              "SPRITECARD_TEXTURE_BLEND_MULTIPLY",
            ) === "SPRITECARD_TEXTURE_BLEND_MULTIPLY" &&
            stringOf(layer.m_nTextureType, "SPRITECARD_TEXTURE_DIFFUSE") ===
              "SPRITECARD_TEXTURE_DIFFUSE",
        )?.m_hTexture,
      "",
    ) || null;
  const blend = stringOf(
    operator.m_nOutputBlendMode,
    "PARTICLE_OUTPUT_BLEND_MODE_ALPHA",
  );
  const addSelf = parseFloatInput(operator.m_flAddSelfAmount, 0);
  return {
    kind,
    texture,
    mask,
    additive:
      blend === "PARTICLE_OUTPUT_BLEND_MODE_ADD" ||
      addSelf.evaluate(STATIC_CONTEXT) > 0,
    overbright: parseFloatInput(operator.m_flOverbrightFactor, 1),
    alphaScale: parseFloatInput(operator.m_flAlphaScale, 1),
    radiusScale: parseFloatInput(operator.m_flRadiusScale, 1),
    colorScale: parseVectorInput(operator.m_vecColorScale, [1, 1, 1]),
    alpha2Field: numberOf(operator.m_nAlpha2Field, FIELD.alpha2),
    animationRate: numberOf(operator.m_flAnimationRate, 0.1),
    textureVWorldSize: numberOf(
      object(operator.m_flTextureVWorldSize).m_flLiteralValue,
      numberOf(operator.m_flTextureVWorldSize, 10),
    ),
    textureVScrollRate: numberOf(
      object(operator.m_flTextureVScrollRate).m_flLiteralValue,
      numberOf(operator.m_flTextureVScrollRate, 0),
    ),
  };
};
