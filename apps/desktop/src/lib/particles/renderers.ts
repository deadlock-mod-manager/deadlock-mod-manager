import {
  object,
  list,
  numberOf,
  stringOf,
  classOf,
  booleanOf,
  numbersOf,
} from "./definition";
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
      : classOf(operator) === "C_OP_RenderRopes"
        ? "ropes"
        : classOf(operator) === "C_OP_RenderTrails"
          ? "trails"
          : classOf(operator) === "C_OP_RenderModels"
            ? "models"
            : null;
  if (!kind) return null;
  const layers = list(operator.m_vecTexturesInput).filter(
    (layer) => layer.m_bEnabled !== false,
  );
  const texture =
    stringOf(layers[0]?.m_hTexture, "") ||
    stringOf(operator.m_hTexture, "") ||
    null;
  // The supported diffuse mask and distortion layers retain distinct data color spaces.
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
  const additive =
    blend === "PARTICLE_OUTPUT_BLEND_MODE_ADD" ||
    addSelf.evaluate(STATIC_CONTEXT) > 0;
  const endcap = stringOf(operator.m_nOpEndCapState, "");
  const distortionTexture =
    stringOf(
      layers.find((layer) =>
        stringOf(layer.m_nTextureType, "").includes("DISTORT"),
      )?.m_hTexture,
      "",
    ) || null;
  const textureControls = object(layers[0]?.m_TextureControls);
  const uvScale = numbersOf(operator.m_vecUVScale, [
    numberOf(textureControls.m_flFinalTextureScaleU, 1),
    numberOf(textureControls.m_flFinalTextureScaleV, 1),
  ]);
  const uvOffset = numbersOf(operator.m_vecUVOffset, [
    numberOf(textureControls.m_flFinalTextureOffsetU, 0),
    numberOf(textureControls.m_flFinalTextureOffsetV, 0),
  ]);
  return {
    kind,
    phase:
      endcap === "PARTICLE_ENDCAP_ENDCAP_ON"
        ? "endcap"
        : endcap === "PARTICLE_ENDCAP_ENDCAP_OFF"
          ? "active"
          : "any",
    models: [
      ...new Set(
        list(operator.m_ModelList ?? operator.m_modelList)
          .map(
            (model) =>
              stringOf(model.m_model, "") || stringOf(model.m_hModel, ""),
          )
          .filter(Boolean),
      ),
    ].slice(0, 12),
    texture,
    mask,
    distortionTexture,
    refractive:
      booleanOf(operator.m_bRefract) ||
      distortionTexture !== null ||
      operator.m_flRefractAmount !== undefined ||
      operator.m_flRefractionStrength !== undefined ||
      blend === "PARTICLE_OUTPUT_BLEND_MODE_REFRACT",
    additive,
    blend: additive
      ? "add"
      : blend === "PARTICLE_OUTPUT_BLEND_MODE_MOD2X" ||
          blend === "PARTICLE_OUTPUT_BLEND_MODE_MULTIPLY"
        ? "multiply"
        : blend === "PARTICLE_OUTPUT_BLEND_MODE_OPAQUE"
          ? "opaque"
          : "alpha",
    minLength: parseFloatInput(operator.m_flMinLength, 0),
    maxLength: parseFloatInput(operator.m_flMaxLength, 2000),
    lengthScale: parseFloatInput(operator.m_flLengthScale, 1),
    lengthFadeInTime: parseFloatInput(operator.m_flLengthFadeInTime, 0),
    tailAlphaScale: parseFloatInput(operator.m_flTailAlphaScale, 1),
    tailColorScale: parseVectorInput(operator.m_vecTailColorScale, [1, 1, 1]),
    constrainRadiusToLengthRatio: parseFloatInput(
      operator.m_flConstrainRadiusToLengthRatio,
      1,
    ),
    ignoreDT: booleanOf(operator.m_bIgnoreDT),
    tailFade: booleanOf(operator.m_bFadeOut),
    subdivisions: Math.min(
      Math.max(
        Math.floor(
          numberOf(
            operator.m_nSubdivCount,
            numberOf(operator.m_nMaxTesselation, 3),
          ),
        ),
        1,
      ),
      8,
    ),
    refractStrength: parseFloatInput(
      operator.m_flRefractAmount ?? operator.m_flRefractionStrength,
      booleanOf(operator.m_bRefract) ||
        distortionTexture ||
        blend === "PARTICLE_OUTPUT_BLEND_MODE_REFRACT"
        ? 0.03
        : 0,
    ),
    uvScale: [uvScale[0] ?? 1, uvScale[1] ?? 1],
    uvOffset: [uvOffset[0] ?? 0, uvOffset[1] ?? 0],
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
